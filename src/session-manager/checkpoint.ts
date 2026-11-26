import { checkpointValid, checksum } from "./storage";
import { SmError, type Checkpoint, type SessionRecord } from "./types";

const SECRET_KEY = /pass(word)?|token|secret|authorization|cookie|credential|apikey|api_key/i;
const MAX_BYTES = 16 * 1024;

/** Checkpoints are plain progress data: reject anything that looks like a credential, and anything oversized. */
export function assertCheckpointData(data: unknown, depth = 0): void {
  if (depth > 6) throw new SmError("INVALID_ARGUMENT", "ساختار داده‌ی نقطه‌ی بازیابی بیش از حد عمیق است.");
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (SECRET_KEY.test(k)) throw new SmError("INVALID_ARGUMENT", "ذخیره‌ی اطلاعات احراز هویت در نقطه‌ی بازیابی مجاز نیست: " + k);
      assertCheckpointData(v, depth + 1);
    }
  }
  if (depth === 0 && JSON.stringify(data ?? null).length > MAX_BYTES) throw new SmError("INVALID_ARGUMENT", "حجم داده‌ی نقطه‌ی بازیابی بیش از حد است.");
}

export function makeCheckpoint(rec: SessionRecord, step: string, data: Record<string, unknown>, at: number): Checkpoint {
  assertCheckpointData(data);
  const seq = (rec.checkpoints[rec.checkpoints.length - 1]?.seq ?? 0) + 1;
  return { seq, at, step, data, checksum: checksum(step, data) };
}

/** Newest checkpoint whose checksum still matches; `null` when none exists, `"corrupt"` when some exist but none is valid. */
export function latestValidCheckpoint(rec: SessionRecord): Checkpoint | null | "corrupt" {
  if (!rec.checkpoints.length) return null;
  for (let i = rec.checkpoints.length - 1; i >= 0; i--) if (checkpointValid(rec.checkpoints[i]!)) return rec.checkpoints[i]!;
  return "corrupt";
}
