/** Centralised, validated session lifecycle. Every state change in the manager goes through `assertTransition`. */
import { SmError, type SessionState } from "./types";

export const TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  IDLE: ["RUNNING", "CANCELLED"],
  RUNNING: ["PAUSING", "COMPLETED", "FAILED", "CANCELLING", "RECOVERY_REQUIRED"],
  // PAUSING waits for the in-flight operation to reach a safe point; a finished finalising op may complete the session
  PAUSING: ["PAUSED", "COMPLETED", "FAILED", "CANCELLING", "RECOVERY_REQUIRED"],
  PAUSED: ["RESUMING", "CANCELLED", "FAILED"],
  RESUMING: ["RUNNING", "PAUSED", "FAILED", "RECOVERY_REQUIRED"],
  CANCELLING: ["CANCELLED", "COMPLETED", "FAILED"],
  RECOVERY_REQUIRED: ["RUNNING", "PAUSED", "COMPLETED", "CANCELLED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export const canTransition = (from: SessionState, to: SessionState): boolean => TRANSITIONS[from].includes(to);

export function assertTransition(from: SessionState, to: SessionState): void {
  if (!canTransition(from, to)) throw new SmError("INVALID_TRANSITION", `انتقال نامعتبر: ${from} → ${to}`);
}

/** Which user actions make sense in a state (the UI shows only these). */
export const allowedActions = (s: SessionState): { pause: boolean; resume: boolean; cancel: boolean; end: boolean } => ({
  pause: s === "RUNNING",
  resume: s === "PAUSED" || s === "RECOVERY_REQUIRED",
  cancel: s === "RUNNING" || s === "PAUSED" || s === "RECOVERY_REQUIRED" || s === "IDLE",
  end: s === "RUNNING" || s === "RECOVERY_REQUIRED",
});
