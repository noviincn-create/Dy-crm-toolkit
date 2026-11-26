# DY CRM Toolkit 1.11.0 — Session Manager

Independent infrastructure module (`src/session-manager/`) that adds **per-session Pause / Resume / Cancel, persistence and recovery**
to the existing session side panel. Purely additive: the legacy session storage (`dyEasyClose.session`), the opportunity creation
flow and the END_PRODUCT (INT-009) logic are unchanged. Without the bridge script the panel behaves exactly as in 1.10.0.

## Behaviour (decisions agreed with the product owner)
| Topic | Behaviour |
|---|---|
| Pause | Freezes that session's clock. "پایان جلسه" is disabled until Resume. Other sessions are never touched. |
| Billing | INT-009 quantity = **active** minutes (paused time excluded). Legacy sessions are adopted with their original start time, so nothing changes until a pause happens. |
| Cooperative pause | PAUSED is reached only when no operation is in flight; a pause requested during the End operation shows PAUSING, and a successfully finished End completes the session. |
| Cancel | Two-step confirmation. Removes the session card only; the CRM opportunity and its products are never touched. |
| Global | Pause All (RUNNING only) / Resume All (PAUSED only — never completed, cancelled, failed or RECOVERY_REQUIRED) / Cancel All (confirmation). |
| Dashboard | Inside the existing side panel: status chips, per-card state/active time/controls, details view (history, pauses, operations, errors, checkpoint, recovery). |
| Safety | If the bridge exists but the manager does not answer, "End session" is refused (never bills paused time by mistake). |

## Architecture
```
CRM page (MAIN world)                 ISOLATED world               Service worker (MV3)
close/session.ts (legacy, +3 hooks)   session-manager/bridge.ts    background/index.ts  ──  handlers.sm
close/session-sm.ts  (panel UI) ───►  DOM CustomEvents  ───►      session-manager/service.ts
session-manager/client.ts             chrome.runtime.sendMessage   session-manager/manager.ts (SessionManager)
                                      storage.onChanged ◄────────  storage.ts → chrome.storage.local  (keys: sm.v1.*)
```
* The MAIN world has no `chrome.*`, hence the bridge (DOM events carrying JSON strings, correlation ids, 5 s timeout).
* Messages ride the **existing** background channel (`BgRequest { type: "sm" }`); the service worker validates every request strictly
  (`messages.ts`: version, op, session id, timestamp, per-op payload) and never throws (errors → `{ ok:false, code, message }`).
* The service worker keeps **no state in memory**: every command is a serialised read-validate-write of one record; recovery runs on
  worker start, browser start, install and every 15 min (`chrome.alarms`, new permission `alarms`).

## Lifecycle
States: IDLE, RUNNING, PAUSING, PAUSED, RESUMING, COMPLETED, FAILED, CANCELLING, CANCELLED, RECOVERY_REQUIRED (`state-machine.ts`, single
transition table; every state change goes through `go()` which also keeps the clock consistent). Invalid transitions → `INVALID_TRANSITION`.
Duplicate commands (double click, two tabs) are idempotent: no extra record, event or `rev` bump.

## Persistence & recovery
* Only keys `sm.v1.*` are written (`meta`, `idx`, `hb`, `s.<id>`, `q.<id>`); nothing else in chrome.storage is read, changed or cleared.
* Records are versioned (`schema`), validated on read, and stale writes are detected (`rev`). Corrupt records are **quarantined** (`sm.v1.q.<id>`), never deleted; records from a newer schema are skipped, not destroyed; a lost index is rebuilt.
* Quota/write errors surface as `STORAGE_FULL` / `STORAGE_FAILED`; nothing is emitted or half-applied. Finished sessions older than 30 days are purged (own keys only).
* The running clock is a stored timestamp (`runningSince`), so a worker restart does not disturb a healthy RUNNING session.
* Recovery flags `RECOVERY_REQUIRED` (clock frozen at last activity, **nothing repeated automatically**) when: an operation was in flight and is older than 2 min (its status becomes `unknown` → explicit reconciliation), or a RUNNING session had no heartbeat/activity for 12 h (browser closed overnight). The panel sends a heartbeat every 60 s.
* Checkpoints carry a checksum; resume uses the latest *valid* one and falls back to RECOVERY_REQUIRED if none validates. Credential-like keys and >16 KB payloads are refused.

## Public API (`src/session-manager/index.ts`)
`create, adopt, start, pause, resume, cancel, complete, fail, get, list, listDetailed, getStatus, updateProgress, saveCheckpoint, touch,
beginOperation, endOperation, reconcileOperation, shouldYield, pauseAll, resumeAll, cancelAll, recover, subscribe`; session types are
registered in `registry.ts` (built in: `generic`, `opportunity-meeting`). Events: the 13 `SESSION_*` types, de-duplicated by `eventId`.
Business modules use the typed client (`smCall`) from the page or `SessionManager` in the worker; they never touch storage directly.

## Tests
`npm test` = build + the 6 original suites + `test:sm` (133 assertions: state machine, clock, cooperative pause, independence, races,
idempotency, record locks, checkpoints, restart/recovery, corruption, quota, validation) + `test:sm-ui` (40 assertions: the real built
bundles in jsdom through the real handler).
