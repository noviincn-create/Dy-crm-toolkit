import type { SessionRecord } from "./types";

/** Active (billable) time at `now`: accumulated time + the running stretch (only while RUNNING). Pure; safe for any bundle. */
export const activeMsAt = (rec: Pick<SessionRecord, "activeMs" | "state" | "runningSince">, now: number): number =>
  rec.activeMs + (rec.state === "RUNNING" && rec.runningSince !== null ? Math.max(0, now - rec.runningSince) : 0);
