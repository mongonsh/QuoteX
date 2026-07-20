import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  CreateSellerListingInput,
  ProductListingCategory,
  ProductListingCondition,
  SellerListing,
  SellerListingPhoto,
  UploadedMedia
} from "../src/types.js";

const CATEGORIES: ProductListingCategory[] = [
  "Handbag",
  "Watch",
  "Jewelry",
  "Accessories",
  "Fashion",
  "Electronics",
  "Home & Garden",
  "Beauty",
  "Collectibles",
  "Sports",
  "Industrial",
  "Other"
];
const CONDITIONS: ProductListingCondition[] = [
  "New or unworn",
  "Excellent",
  "Very good",
  "Good",
  "Fair"
];
const TARGET_MARKETS: SellerListing["targetMarket"][] = [
  "Japan",
  "United States",
  "Germany"
];
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i;
const MAX_IMAGE_BYTES = 5_000_000;

interface ListingRow {
  id: string;
  seller_name: string;
  seller_email: string;
  seller_location: string;
  target_market: SellerListing["targetMarket"];
  brand: string;
  model: string;
  category: ProductListingCategory;
  condition: ProductListingCondition;
  color: string;
  material: string;
  manufacture_year: number | null;
  asking_price_usd: number;
  desired_sale_days: number;
  description: string;
  authenticity_notes: string;
  ownership_confirmed: number;
  status: SellerListing["status"];
  photo_file_name: string;
  photo_mime_type: string;
  photo_size_bytes: number;
  created_at: string;
  updated_at: string;
}

interface PhotoRow {
  photo_file_name: string;
  photo_mime_type: string;
  photo_size_bytes: number;
  photo_blob: Uint8Array;
}

export class ListingValidationError extends Error {
  readonly status = 400;
}

export class SellerListingStore {
  readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS seller_listings (
        id TEXT PRIMARY KEY,
        seller_name TEXT NOT NULL,
        seller_email TEXT NOT NULL,
        seller_location TEXT NOT NULL,
        target_market TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        category TEXT NOT NULL,
        condition TEXT NOT NULL,
        color TEXT NOT NULL,
        material TEXT NOT NULL,
        manufacture_year INTEGER,
        asking_price_usd REAL NOT NULL,
        desired_sale_days INTEGER NOT NULL,
        description TEXT NOT NULL,
        authenticity_notes TEXT NOT NULL,
        ownership_confirmed INTEGER NOT NULL CHECK (ownership_confirmed IN (0, 1)),
        status TEXT NOT NULL CHECK (status IN ('intake', 'ready')),
        photo_file_name TEXT NOT NULL,
        photo_mime_type TEXT NOT NULL,
        photo_size_bytes INTEGER NOT NULL,
        photo_blob BLOB NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS seller_listings_created_at
      ON seller_listings(created_at DESC);
    `);
  }

  list(): SellerListing[] {
    const rows = this.database
      .prepare(`${listingColumns()} FROM seller_listings ORDER BY created_at DESC`)
      .all() as unknown as ListingRow[];

    return rows.map(mapListingRow);
  }

  get(id: string): SellerListing | null {
    const row = this.database
      .prepare(`${listingColumns()} FROM seller_listings WHERE id = ?`)
      .get(id) as unknown as ListingRow | undefined;

    return row ? mapListingRow(row) : null;
  }

  create(value: unknown): SellerListing {
    const input = normalizeSellerListingInput(value);
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const decodedPhoto = decodeListingPhoto(input.photo);

    this.database
      .prepare(`
        INSERT INTO seller_listings (
          id, seller_name, seller_email, seller_location, target_market,
          brand, model, category, condition, color, material, manufacture_year,
          asking_price_usd, desired_sale_days, description, authenticity_notes,
          ownership_confirmed, status, photo_file_name, photo_mime_type,
          photo_size_bytes, photo_blob, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.sellerName,
        input.sellerEmail,
        input.sellerLocation,
        input.targetMarket,
        input.brand,
        input.model,
        input.category,
        input.condition,
        input.color,
        input.material,
        input.manufactureYear,
        input.askingPriceUsd,
        input.desiredSaleDays,
        input.description,
        input.authenticityNotes,
        input.ownershipConfirmed ? 1 : 0,
        "intake",
        input.photo.fileName,
        decodedPhoto.mimeType,
        decodedPhoto.bytes.length,
        decodedPhoto.bytes,
        timestamp,
        timestamp
      );

    return this.get(id)!;
  }

  getPhoto(id: string): { photo: SellerListingPhoto; bytes: Uint8Array } | null {
    const row = this.database
      .prepare(`
        SELECT photo_file_name, photo_mime_type, photo_size_bytes, photo_blob
        FROM seller_listings
        WHERE id = ?
      `)
      .get(id) as unknown as PhotoRow | undefined;

    if (!row) return null;

    return {
      photo: {
        fileName: row.photo_file_name,
        mimeType: row.photo_mime_type,
        sizeBytes: row.photo_size_bytes,
        url: sellerListingPhotoUrl(id)
      },
      bytes: row.photo_blob
    };
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM seller_listings WHERE id = ?").run(id);
    return result.changes > 0;
  }

  close(): void {
    this.database.close();
  }
}

function listingColumns(): string {
  return `SELECT id, seller_name, seller_email, seller_location, target_market,
    brand, model, category, condition, color, material, manufacture_year,
    asking_price_usd, desired_sale_days, description, authenticity_notes,
    ownership_confirmed, status, photo_file_name, photo_mime_type,
    photo_size_bytes, created_at, updated_at`;
}

function mapListingRow(row: ListingRow): SellerListing {
  return {
    id: row.id,
    sellerName: row.seller_name,
    sellerEmail: row.seller_email,
    sellerLocation: row.seller_location,
    targetMarket: row.target_market,
    brand: row.brand,
    model: row.model,
    category: row.category,
    condition: row.condition,
    color: row.color,
    material: row.material,
    manufactureYear: row.manufacture_year,
    askingPriceUsd: row.asking_price_usd,
    desiredSaleDays: row.desired_sale_days,
    description: row.description,
    authenticityNotes: row.authenticity_notes,
    ownershipConfirmed: Boolean(row.ownership_confirmed),
    status: row.status,
    photo: {
      fileName: row.photo_file_name,
      mimeType: row.photo_mime_type,
      sizeBytes: row.photo_size_bytes,
      url: sellerListingPhotoUrl(row.id)
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function sellerListingPhotoUrl(id: string): string {
  return `/api/listings/${encodeURIComponent(id)}/photo`;
}

export function normalizeSellerListingInput(value: unknown): CreateSellerListingInput {
  const source = isRecord(value) ? value : {};
  const year = optionalInteger(source.manufactureYear, "Manufacture year", 1900, new Date().getFullYear());
  const askingPriceUsd = requiredNumber(source.askingPriceUsd, "Asking price", 1, 10_000_000);
  const desiredSaleDays = requiredInteger(source.desiredSaleDays, "Sale timeline", 1, 365);
  const category = enumValue(source.category, CATEGORIES, "Category");
  const condition = enumValue(source.condition, CONDITIONS, "Condition");
  const targetMarket = enumValue(source.targetMarket, TARGET_MARKETS, "Target market");
  const sellerEmail = requiredText(source.sellerEmail, "Email", 160).toLowerCase();
  const ownershipConfirmed = source.ownershipConfirmed === true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sellerEmail)) {
    throw new ListingValidationError("Enter a valid seller email address.");
  }
  if (!ownershipConfirmed) {
    throw new ListingValidationError("Confirm that you own the item and may sell it.");
  }
  if (!isRecord(source.photo)) {
    throw new ListingValidationError("Add one clear product photo.");
  }

  return {
    sellerName: requiredText(source.sellerName, "Seller name", 100),
    sellerEmail,
    sellerLocation: requiredText(source.sellerLocation, "Seller location", 120),
    targetMarket,
    brand: requiredText(source.brand, "Brand", 80),
    model: requiredText(source.model, "Model", 120),
    category,
    condition,
    color: requiredText(source.color, "Color", 80),
    material: optionalText(source.material, 120),
    manufactureYear: year,
    askingPriceUsd,
    desiredSaleDays,
    description: requiredText(source.description, "Description", 1200),
    authenticityNotes: optionalText(source.authenticityNotes, 600),
    ownershipConfirmed,
    photo: normalizePhoto(source.photo)
  };
}

function normalizePhoto(value: Record<string, unknown>): UploadedMedia {
  return {
    fileName: requiredText(value.fileName, "Photo filename", 180),
    mimeType: requiredText(value.mimeType, "Photo type", 40).toLowerCase(),
    sizeBytes: Number(value.sizeBytes) || 0,
    dataUrl: requiredText(value.dataUrl, "Photo", 7_000_000)
  };
}

export function decodeListingPhoto(
  photo: UploadedMedia
): { mimeType: string; bytes: Uint8Array } {
  const match = photo.dataUrl.match(IMAGE_DATA_URL);
  if (!match) throw new ListingValidationError("Use a PNG, JPEG, or WebP product photo.");

  const mimeType = match[1]!.toLowerCase();
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new ListingValidationError("Use a product photo under 5 MB.");
  }
  if (!matchesImageSignature(bytes, mimeType)) {
    throw new ListingValidationError("The uploaded file does not match its image type.");
  }

  return { mimeType, bytes };
}

function matchesImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  }
  return false;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) throw new ListingValidationError(`${label} is required.`);
  if (text.length > maxLength) throw new ListingValidationError(`${label} is too long.`);
  return text;
}

function optionalText(value: unknown, maxLength: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length > maxLength) throw new ListingValidationError("One of the optional fields is too long.");
  return text;
}

function requiredNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new ListingValidationError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return Math.round(number * 100) / 100;
}

function requiredInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = requiredNumber(value, label, minimum, maximum);
  if (!Number.isInteger(number)) throw new ListingValidationError(`${label} must be a whole number.`);
  return number;
}

function optionalInteger(value: unknown, label: string, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return requiredInteger(value, label, minimum, maximum);
}

function enumValue<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  const normalized = String(value ?? "") as T;
  if (!choices.includes(normalized)) {
    throw new ListingValidationError(`${label} is not supported.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
