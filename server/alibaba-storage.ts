import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  decodeListingPhoto,
  normalizeSellerListingInput,
  sellerListingPhotoUrl
} from "./listing-store.js";
import type {
  AgentRunRepository,
  Persistence,
  SellerListingRepository
} from "./persistence.js";
import type { StoredAgentRun } from "./agent-run-store.js";
import type {
  AgentRunEvidence,
  SellerListing,
  SellerListingPhoto,
  StorageConfig
} from "../src/types.js";

const require = createRequire(import.meta.url);
const MAX_RETAINED_RUNS = 200;
const MAX_TABLE_ROWS = 1_000;

export interface JsonDocument {
  id: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface JsonDocumentGateway {
  ensureTable(tableName: string, autoCreate: boolean): Promise<void>;
  put(tableName: string, document: JsonDocument): Promise<void>;
  get(tableName: string, id: string): Promise<JsonDocument | null>;
  list(tableName: string, limit: number): Promise<JsonDocument[]>;
  delete(tableName: string, id: string): Promise<boolean>;
}

export interface ObjectBlobGateway {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

interface StoredListingDocument {
  listing: SellerListing;
  objectKey: string;
}

export class AlibabaSellerListingStore implements SellerListingRepository {
  constructor(
    private readonly documents: JsonDocumentGateway,
    private readonly objects: ObjectBlobGateway,
    private readonly tableName: string,
    private readonly objectPrefix: string
  ) {}

  async list(): Promise<SellerListing[]> {
    const documents = await this.documents.list(this.tableName, MAX_TABLE_ROWS);
    return documents
      .map((document) => parseStoredListing(document)?.listing)
      .filter((listing): listing is SellerListing => Boolean(listing))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async get(id: string): Promise<SellerListing | null> {
    const document = await this.documents.get(this.tableName, id);
    return document ? parseStoredListing(document)?.listing || null : null;
  }

  async create(value: unknown): Promise<SellerListing> {
    const input = normalizeSellerListingInput(value);
    const decodedPhoto = decodeListingPhoto(input.photo);
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const objectKey = [
      this.objectPrefix,
      "listings",
      id,
      `source.${extensionForMimeType(decodedPhoto.mimeType)}`
    ]
      .filter(Boolean)
      .join("/");
    const listing: SellerListing = {
      ...input,
      id,
      status: "intake",
      photo: {
        fileName: input.photo.fileName,
        mimeType: decodedPhoto.mimeType,
        sizeBytes: decodedPhoto.bytes.length,
        url: sellerListingPhotoUrl(id)
      },
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await this.objects.put(objectKey, decodedPhoto.bytes, decodedPhoto.mimeType);
    try {
      await this.documents.put(this.tableName, {
        id,
        createdAt: timestamp,
        payload: { listing, objectKey }
      });
    } catch (error) {
      await this.objects.delete(objectKey).catch(() => undefined);
      throw error;
    }

    return listing;
  }

  async getPhoto(
    id: string
  ): Promise<{ photo: SellerListingPhoto; bytes: Uint8Array } | null> {
    const document = await this.documents.get(this.tableName, id);
    const stored = document ? parseStoredListing(document) : null;
    if (!stored) return null;

    const bytes = await this.objects.get(stored.objectKey);
    return bytes ? { photo: stored.listing.photo, bytes } : null;
  }

  async delete(id: string): Promise<boolean> {
    const document = await this.documents.get(this.tableName, id);
    const stored = document ? parseStoredListing(document) : null;
    if (!stored) return false;

    const deleted = await this.documents.delete(this.tableName, id);
    if (deleted) {
      await this.objects.delete(stored.objectKey).catch((error) => {
        console.error(
          JSON.stringify({
            event: "oss_cleanup_failed",
            listingId: id,
            objectKey: stored.objectKey,
            error: errorMessage(error)
          })
        );
      });
    }
    return deleted;
  }

  close(): void {}
}

export class AlibabaAgentRunStore implements AgentRunRepository {
  constructor(
    private readonly documents: JsonDocumentGateway,
    private readonly tableName: string
  ) {}

  async save(evidence: AgentRunEvidence, requestLabel: string): Promise<StoredAgentRun> {
    const label = cleanRequestLabel(requestLabel);
    await this.documents.put(this.tableName, {
      id: evidence.runId,
      createdAt: evidence.completedAt,
      payload: { evidence, requestLabel: label }
    });

    const retained = await this.documents.list(this.tableName, MAX_RETAINED_RUNS + 100);
    const expired = retained
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(MAX_RETAINED_RUNS);
    await Promise.all(expired.map((document) => this.documents.delete(this.tableName, document.id)));

    return mapStoredAgentRun(evidence, label, true);
  }

  async list(limit = 20): Promise<StoredAgentRun[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.round(limit) || 20));
    const documents = await this.documents.list(this.tableName, MAX_TABLE_ROWS);
    return documents
      .map((document) => parseAgentRunDocument(document, false))
      .filter((run): run is StoredAgentRun => Boolean(run))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, safeLimit);
  }

  async get(runId: string): Promise<StoredAgentRun | null> {
    const document = await this.documents.get(this.tableName, runId);
    return document ? parseAgentRunDocument(document, true) : null;
  }

  async count(): Promise<number> {
    const documents = await this.documents.list(this.tableName, MAX_TABLE_ROWS);
    return documents.length;
  }

  close(): void {}
}

export async function createAlibabaPersistence(
  config: StorageConfig
): Promise<Persistence> {
  validateAlibabaStorageConfig(config);
  const documents = createTableStoreGateway(config);
  const objects = createOssGateway(config);

  await Promise.all([
    documents.ensureTable(
      config.tableStore.listingsTable,
      config.tableStore.autoCreateTables
    ),
    documents.ensureTable(
      config.tableStore.agentRunsTable,
      config.tableStore.autoCreateTables
    )
  ]);

  const listingStore = new AlibabaSellerListingStore(
    documents,
    objects,
    config.tableStore.listingsTable,
    config.oss.objectPrefix
  );
  const agentRunStore = new AlibabaAgentRunStore(
    documents,
    config.tableStore.agentRunsTable
  );

  return {
    provider: "alibaba",
    database: "Alibaba Tablestore",
    objectStorage: "Alibaba OSS",
    durable: true,
    listingStore,
    agentRunStore,
    async close() {}
  };
}

export function validateAlibabaStorageConfig(config: StorageConfig): void {
  const missing = [
    ...(!config.accessKeyId ? ["Alibaba access key ID"] : []),
    ...(!config.accessKeySecret ? ["Alibaba access key secret"] : []),
    ...(!config.tableStore.instanceName ? ["TABLESTORE_INSTANCE_NAME"] : []),
    ...(!config.tableStore.endpoint ? ["TABLESTORE_ENDPOINT"] : []),
    ...(!config.oss.bucket ? ["OSS_BUCKET"] : [])
  ];
  if (missing.length) {
    throw new Error(`Alibaba persistence is not configured: ${missing.join(", ")}.`);
  }
}

function parseStoredListing(document: JsonDocument): StoredListingDocument | null {
  const listing = document.payload.listing;
  const objectKey = document.payload.objectKey;
  if (!isRecord(listing) || typeof objectKey !== "string" || !objectKey) return null;
  if (typeof listing.id !== "string" || !isRecord(listing.photo)) return null;
  return {
    listing: listing as unknown as SellerListing,
    objectKey
  };
}

function parseAgentRunDocument(
  document: JsonDocument,
  includeEvidence: boolean
): StoredAgentRun | null {
  const evidence = document.payload.evidence;
  const requestLabel = document.payload.requestLabel;
  if (!isAgentRunEvidence(evidence) || typeof requestLabel !== "string") return null;
  return mapStoredAgentRun(evidence, requestLabel, includeEvidence);
}

function mapStoredAgentRun(
  evidence: AgentRunEvidence,
  requestLabel: string,
  includeEvidence: boolean
): StoredAgentRun {
  return {
    runId: evidence.runId,
    auditDigest: evidence.auditDigest,
    status: evidence.status,
    model: evidence.model,
    requestLabel,
    elapsedMs: evidence.elapsedMs,
    plannerTurns: evidence.plannerTurns,
    toolCalls: evidence.skillExecutions.length,
    completedSkills: evidence.completedSkills.length,
    requiredSkills: evidence.requiredSkills.length,
    approvalGate: evidence.approvalGate,
    createdAt: evidence.completedAt,
    ...(includeEvidence ? { evidence } : {})
  };
}

function createTableStoreGateway(config: StorageConfig): JsonDocumentGateway {
  const TableStore = require("tablestore") as TableStoreModule;
  const client = new TableStore.Client({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.accessKeySecret,
    ...(config.securityToken ? { stsToken: config.securityToken } : {}),
    endpoint: config.tableStore.endpoint,
    instancename: config.tableStore.instanceName,
    maxRetries: 3,
    httpOptions: { timeout: 15_000, maxSockets: 64 }
  });

  return {
    async ensureTable(tableName, autoCreate) {
      const result = await client.listTable({});
      const tables = Array.isArray(result.tableNames) ? result.tableNames : [];
      if (tables.includes(tableName)) return;
      if (!autoCreate) {
        throw new Error(`Alibaba Tablestore table "${tableName}" does not exist.`);
      }
      await client.createTable({
        tableMeta: {
          tableName,
          primaryKey: [{ name: "id", type: "STRING" }]
        },
        reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
        tableOptions: { timeToLive: -1, maxVersions: 1 }
      });
    },
    async put(tableName, document) {
      await client.putRow({
        tableName,
        condition: new TableStore.Condition(
          TableStore.RowExistenceExpectation.IGNORE,
          null
        ),
        primaryKey: [{ id: document.id }],
        attributeColumns: [
          { payload: JSON.stringify(document.payload) },
          { created_at: document.createdAt }
        ]
      });
    },
    async get(tableName, id) {
      const result = await client.getRow({
        tableName,
        primaryKey: [{ id }],
        maxVersions: 1
      });
      return parseTableStoreRow(result.row || result);
    },
    async list(tableName, limit) {
      const documents: JsonDocument[] = [];
      let start = [{ id: TableStore.INF_MIN }];
      while (documents.length < limit) {
        const result = await client.getRange({
          tableName,
          direction: TableStore.Direction.FORWARD,
          maxVersions: 1,
          inclusiveStartPrimaryKey: start,
          exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
          limit: Math.min(100, limit - documents.length)
        });
        for (const row of result.rows || []) {
          const document = parseTableStoreRow(row);
          if (document) documents.push(document);
        }
        if (!result.nextStartPrimaryKey?.length) break;
        start = [{ id: result.nextStartPrimaryKey[0]!.value }];
      }
      return documents;
    },
    async delete(tableName, id) {
      const existing = await this.get(tableName, id);
      if (!existing) return false;
      await client.deleteRow({
        tableName,
        condition: new TableStore.Condition(
          TableStore.RowExistenceExpectation.IGNORE,
          null
        ),
        primaryKey: [{ id }]
      });
      return true;
    }
  };
}

function createOssGateway(config: StorageConfig): ObjectBlobGateway {
  const OSS = require("ali-oss") as OssConstructor;
  const client = new OSS({
    region: config.oss.region,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    ...(config.securityToken ? { stsToken: config.securityToken } : {}),
    bucket: config.oss.bucket,
    internal: config.oss.internal,
    secure: true,
    authorizationV4: true,
    timeout: 30_000
  });

  return {
    async put(key, bytes, mimeType) {
      const headers: Record<string, string> = {};
      if (config.oss.serverSideEncryption === "AES256") {
        headers["x-oss-server-side-encryption"] = "AES256";
      }
      await client.put(key, Buffer.from(bytes), {
        mime: mimeType,
        headers
      });
    },
    async get(key) {
      try {
        const result = await client.get(key);
        return result.content ? new Uint8Array(result.content) : null;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async delete(key) {
      try {
        await client.delete(key);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
  };
}

function parseTableStoreRow(value: unknown): JsonDocument | null {
  if (!isRecord(value)) return null;
  const primaryKey = Array.isArray(value.primaryKey) ? value.primaryKey : [];
  const attributes = Array.isArray(value.attributes) ? value.attributes : [];
  const idColumn = primaryKey.find(
    (column): column is { name: string; value: unknown } =>
      isRecord(column) && column.name === "id"
  );
  const payloadColumn = attributes.find(
    (column): column is { columnName: string; columnValue: unknown } =>
      isRecord(column) && column.columnName === "payload"
  );
  const createdAtColumn = attributes.find(
    (column): column is { columnName: string; columnValue: unknown } =>
      isRecord(column) && column.columnName === "created_at"
  );
  if (
    typeof idColumn?.value !== "string" ||
    typeof payloadColumn?.columnValue !== "string" ||
    typeof createdAtColumn?.columnValue !== "string"
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(payloadColumn.columnValue);
    return isRecord(payload)
      ? {
          id: idColumn.value,
          createdAt: createdAtColumn.columnValue,
          payload
        }
      : null;
  } catch {
    return null;
  }
}

function extensionForMimeType(mimeType: string): "png" | "jpg" | "webp" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function cleanRequestLabel(value: string): string {
  const label = String(value || "Untitled request").replace(/\s+/g, " ").trim();
  return label.slice(0, 180) || "Untitled request";
}

function isAgentRunEvidence(value: unknown): value is AgentRunEvidence {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    typeof value.auditDigest === "string" &&
    typeof value.completedAt === "string" &&
    Array.isArray(value.skillExecutions)
  );
}

function isNotFound(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.status === 404 ||
    error.statusCode === 404 ||
    error.code === "NoSuchKey" ||
    error.code === "NotFound"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface TableStoreResult {
  tableNames?: string[];
  row?: unknown;
  rows?: unknown[];
  nextStartPrimaryKey?: Array<{ name: string; value: unknown }>;
}

interface TableStoreClient {
  listTable(params: Record<string, never>): Promise<TableStoreResult>;
  createTable(params: Record<string, unknown>): Promise<TableStoreResult>;
  putRow(params: Record<string, unknown>): Promise<TableStoreResult>;
  getRow(params: Record<string, unknown>): Promise<TableStoreResult>;
  getRange(params: Record<string, unknown>): Promise<TableStoreResult>;
  deleteRow(params: Record<string, unknown>): Promise<TableStoreResult>;
}

interface TableStoreModule {
  Client: new (options: Record<string, unknown>) => TableStoreClient;
  Condition: new (expectation: number, condition: null) => unknown;
  RowExistenceExpectation: { IGNORE: number };
  Direction: { FORWARD: string };
  INF_MIN: unknown;
  INF_MAX: unknown;
}

interface OssClient {
  put(
    key: string,
    bytes: Buffer,
    options: { mime: string; headers: Record<string, string> }
  ): Promise<unknown>;
  get(key: string): Promise<{ content?: Buffer }>;
  delete(key: string): Promise<unknown>;
}

type OssConstructor = new (options: Record<string, unknown>) => OssClient;
