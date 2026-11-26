/** Public API of the Session Manager (stable surface for business modules). */
export { SessionManager, activeMsAt, type BeginOpInput, type BeginOpResult, type EndOpInput, type BulkResult, type RecoveryReport, type ManagerOptions } from "./manager";
export { assertTransition, canTransition, allowedActions, TRANSITIONS } from "./state-machine";
export { SessionTypeRegistry, defaultRegistry, OPPORTUNITY_SESSION_TYPE, type SessionTypeDef } from "./registry";
export { SessionScheduler } from "./scheduler";
export { ChromeStorageAdapter, MemoryStorageAdapter, SessionStore, KEY, type StorageAdapter } from "./storage";
export { handleSmMessage, installSessionManager, getManager } from "./service";
export { smCall, smOnChange, smAvailable } from "./client";
export * from "./types";
export type { SmOp, SmPayloads, SmRequest, SmResponse, SmResults } from "./messages";
