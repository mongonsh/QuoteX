import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { AgentRunEvidence } from "../src/types.js";

const MAX_RETAINED_RUNS = 200;
const require = createRequire(import.meta.url);

interface AgentRunRow {
  run_id: string;
  audit_digest: string;
  status: AgentRunEvidence["status"];
  model: string;
  request_label: string;
  elapsed_ms: number;
  planner_turns: number;
  tool_calls: number;
  completed_skills: number;
  required_skills: number;
  approval_gate: AgentRunEvidence["approvalGate"];
  evidence_json: string;
  created_at: string;
}

export interface StoredAgentRun {
  runId: string;
  auditDigest: string;
  status: AgentRunEvidence["status"];
  model: string;
  requestLabel: string;
  elapsedMs: number;
  plannerTurns: number;
  toolCalls: number;
  completedSkills: number;
  requiredSkills: number;
  approvalGate: AgentRunEvidence["approvalGate"];
  createdAt: string;
  evidence?: AgentRunEvidence;
}

export class AgentRunStore {
  readonly database: DatabaseSyncType;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS agent_runs (
        run_id TEXT PRIMARY KEY,
        audit_digest TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('live', 'guarded-fallback', 'failed')),
        model TEXT NOT NULL,
        request_label TEXT NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        planner_turns INTEGER NOT NULL,
        tool_calls INTEGER NOT NULL,
        completed_skills INTEGER NOT NULL,
        required_skills INTEGER NOT NULL,
        approval_gate TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS agent_runs_created_at
      ON agent_runs(created_at DESC);
    `);
  }

  save(evidence: AgentRunEvidence, requestLabel: string): StoredAgentRun {
    const label = cleanLabel(requestLabel);
    this.database
      .prepare(`
        INSERT OR REPLACE INTO agent_runs (
          run_id, audit_digest, status, model, request_label, elapsed_ms,
          planner_turns, tool_calls, completed_skills, required_skills,
          approval_gate, evidence_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        evidence.runId,
        evidence.auditDigest,
        evidence.status,
        evidence.model,
        label,
        evidence.elapsedMs,
        evidence.plannerTurns,
        evidence.skillExecutions.length,
        evidence.completedSkills.length,
        evidence.requiredSkills.length,
        evidence.approvalGate,
        JSON.stringify(evidence),
        evidence.completedAt
      );

    this.database
      .prepare(`
        DELETE FROM agent_runs
        WHERE run_id NOT IN (
          SELECT run_id FROM agent_runs ORDER BY created_at DESC LIMIT ?
        )
      `)
      .run(MAX_RETAINED_RUNS);

    return this.get(evidence.runId)!;
  }

  list(limit = 20): StoredAgentRun[] {
    const safeLimit = Math.max(1, Math.min(100, Math.round(limit) || 20));
    const rows = this.database
      .prepare(`
        SELECT run_id, audit_digest, status, model, request_label, elapsed_ms,
          planner_turns, tool_calls, completed_skills, required_skills,
          approval_gate, evidence_json, created_at
        FROM agent_runs
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(safeLimit) as unknown as AgentRunRow[];
    return rows.map((row) => mapRow(row, false));
  }

  get(runId: string): StoredAgentRun | null {
    const row = this.database
      .prepare(`
        SELECT run_id, audit_digest, status, model, request_label, elapsed_ms,
          planner_turns, tool_calls, completed_skills, required_skills,
          approval_gate, evidence_json, created_at
        FROM agent_runs
        WHERE run_id = ?
      `)
      .get(runId) as unknown as AgentRunRow | undefined;
    return row ? mapRow(row, true) : null;
  }

  count(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM agent_runs").get() as {
      count: number;
    };
    return Number(row.count || 0);
  }

  close(): void {
    this.database.close();
  }
}

function mapRow(row: AgentRunRow, includeEvidence: boolean): StoredAgentRun {
  return {
    runId: row.run_id,
    auditDigest: row.audit_digest,
    status: row.status,
    model: row.model,
    requestLabel: row.request_label,
    elapsedMs: row.elapsed_ms,
    plannerTurns: row.planner_turns,
    toolCalls: row.tool_calls,
    completedSkills: row.completed_skills,
    requiredSkills: row.required_skills,
    approvalGate: row.approval_gate,
    createdAt: row.created_at,
    ...(includeEvidence ? { evidence: JSON.parse(row.evidence_json) as AgentRunEvidence } : {})
  };
}

function cleanLabel(value: string): string {
  const label = String(value || "Untitled request").replace(/\s+/g, " ").trim();
  return label.slice(0, 180) || "Untitled request";
}
