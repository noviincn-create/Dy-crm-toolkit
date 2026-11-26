/** Session type registry: each type declares what it can do and how an interrupted operation is treated on recovery. */
import { SmError } from "./types";

export interface SessionTypeDef {
  type: string;
  label: string;
  /** Can the session be paused (clock frozen, finalising blocked)? */
  pausable: boolean;
}

export class SessionTypeRegistry {
  private defs = new Map<string, SessionTypeDef>();

  constructor(defs: SessionTypeDef[] = []) {
    for (const d of defs) this.register(d);
  }
  register(def: SessionTypeDef): void {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(def.type)) throw new SmError("INVALID_ARGUMENT", "نوع جلسه نامعتبر است: " + def.type);
    this.defs.set(def.type, def);
  }
  get(type: string): SessionTypeDef {
    const d = this.defs.get(type);
    if (!d) throw new SmError("UNKNOWN_TYPE", "نوع جلسه ثبت نشده است: " + type);
    return d;
  }
  has(type: string): boolean { return this.defs.has(type); }
}

/** Built-in types. Business modules add theirs through `registry.register`. */
export const OPPORTUNITY_SESSION_TYPE = "opportunity-meeting";
export const defaultRegistry = (): SessionTypeRegistry =>
  new SessionTypeRegistry([
    { type: "generic", label: "جلسه عمومی", pausable: true },
    { type: OPPORTUNITY_SESSION_TYPE, label: "جلسهٔ فرصت", pausable: true },
  ]);
