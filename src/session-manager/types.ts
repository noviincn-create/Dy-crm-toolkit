/** Session Manager: shared types. Independent of every business module (opportunity, KYC, invoice ...). */

export const SM_SCHEMA_VERSION = 1;

export const SESSION_STATES = [
  "IDLE", "RUNNING", "PAUSING", "PAUSED", "RESUMING", "COMPLETED", "FAILED", "CANCELLING", "CANCELLED", "RECOVERY_REQUIRED",
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const TERMINAL_STATES: readonly SessionState[] = ["COMPLETED", "FAILED", "CANCELLED"];
export const isTerminal = (s: SessionState): boolean => TERMINAL_STATES.includes(s);

export type MetaValue = string | number | boolean | null;
export type Meta = Record<string, MetaValue>;

export interface OperationRecord {
  /** Idempotency key: the same key is never executed twice. */
  key: string;
  label: string;
  /** inflight = running now; unknown = interrupted, outcome not known (needs reconciliation). */
  status: "inflight" | "done" | "failed" | "unknown";
  startedAt: number;
  finishedAt?: number;
  /** CRM record the operation touches (used for cross-session concurrency protection). */
  recordKey?: string;
  error?: string;
}

export interface Checkpoint {
  seq: number;
  at: number;
  step: string;
  data: Record<string, unknown>;
  /** Integrity hash of step + data (never contains secrets). */
  checksum: string;
}

export interface PauseEntry { pausedAt: number; resumedAt?: number; reason?: string }
export interface HistoryEntry { at: number; from: SessionState; to: SessionState; reason?: string }
export interface ErrorEntry { at: number; message: string; step?: string }

export interface SessionRecord {
  schema: number;
  id: string;
  /** Registered session type (e.g. "opportunity-meeting"). */
  type: string;
  name: string;
  /** The CRM record this session belongs to (e.g. an opportunity id), if any. */
  externalRef: string | null;
  meta: Meta;
  state: SessionState;
  /** Incremented on every write (stale-write detection). */
  rev: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  lastActivityAt: number;
  /** Active execution time already accumulated (excludes pauses). */
  activeMs: number;
  /** Set only while the clock is running (state RUNNING). */
  runningSince: number | null;
  step: string | null;
  progress: number | null;
  checkpoints: Checkpoint[];
  operations: OperationRecord[];
  pauses: PauseEntry[];
  history: HistoryEntry[];
  errors: ErrorEntry[];
  recovery: { reason: string; at: number } | null;
}

// ───────────── events ─────────────
export const SM_EVENT_TYPES = [
  "SESSION_CREATED", "SESSION_STARTED", "SESSION_PAUSING", "SESSION_PAUSED", "SESSION_RESUMING", "SESSION_RESUMED",
  "SESSION_PROGRESS_UPDATED", "SESSION_CHECKPOINT_SAVED", "SESSION_COMPLETED", "SESSION_FAILED", "SESSION_CANCELLED",
  "SESSION_RECOVERED", "SESSION_RECOVERY_REQUIRED",
] as const;
export type SmEventType = (typeof SM_EVENT_TYPES)[number];

export interface SmEvent {
  type: SmEventType;
  sessionId: string;
  ts: number;
  /** Unique per (session, rev, type): subscribers can drop duplicates. */
  eventId: string;
  payload: { state: SessionState; rev: number; reason?: string };
  correlationId?: string;
}

export type SmListener = (e: SmEvent) => void;

// ───────────── errors ─────────────
export type SmErrorCode =
  | "NOT_FOUND" | "INVALID_TRANSITION" | "INVALID_ARGUMENT" | "BUSY" | "RECORD_LOCKED" | "STORAGE_FAILED" | "STORAGE_FULL"
  | "UNKNOWN_TYPE" | "CORRUPT" | "UNAVAILABLE";

export class SmError extends Error {
  constructor(readonly code: SmErrorCode, message: string) {
    super(message);
    this.name = "SmError";
  }
}
