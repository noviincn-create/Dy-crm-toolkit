"use strict";
(() => {
  // src/shared/config.ts
  var ZOHAL_URL = "https://service.zohal.io/api/v0/services/inquiry";
  var IPPANEL_URL = "https://edge.ippanel.com/v1/api/send";
  var OTP_LENGTH = 6;
  var OTP_PARAM_NAME = "otp";
  var OTP_PATTERN = "75cpgflgz2q9rxt";
  var SENDER_NUMBER = "+983000505";
  var WELCOME_PATTERN = "4vegiqdx6umlmn2";
  var CONTACT_NATIONAL_FIELD = "systan_nationalcode";
  var CONTACT_BIRTHDATE_FIELD = "systan_birthdatefa";
  var CONTACT_FATHERNAME_FIELD = "systan_fathername";
  var DEFAULTS = {
    contactNationalField: CONTACT_NATIONAL_FIELD,
    // fixed Contact National ID field
    accountNationalField: "systan_nationalidbase",
    // account: company national ID
    titleField: "systan_titlebase",
    // contact Title (option set <select>)
    titleMale: "728940000",
    // Zohal gender 1 = Male (option value)
    titleFemale: "728940001",
    // Zohal gender 0 = Female (option value)
    autoSave: true
    // click Save and Close after the form is filled
  };
  var INVOICE_DEFAULTS = {
    ctrlP: true,
    showBuyer: true,
    numberField: "new_opportunitynumbertext",
    title: "صورت‌حساب فروش کالا و خدمات",
    seller: {
      name: "کافی نت نوین",
      guild: "1404352002",
      economicCode: "",
      regNo: "",
      province: "خراسان رضوی",
      county: "",
      city: "مشهد",
      postal: "9189936636",
      phone: "09040201536",
      address: "قاسم‌آباد، بلوار امامیه ۳۳، کافی نت نوین"
    }
  };
  var mergeInvoiceConfig = (raw) => ({
    ...INVOICE_DEFAULTS,
    ...raw,
    seller: { ...INVOICE_DEFAULTS.seller, ...raw?.seller ?? {} }
  });
  var INVOICE_STORAGE_KEY = "invoiceCfg";
  var DEFAULT_CRM_URL = "https://novincn.crm.systan.com";
  var QUICK_DEFAULTS = {
    enabled: true,
    startKey: "Shift",
    endKey: "Control",
    tapMs: 400,
    openForm: false,
    mainPriceList: "قیمت اصلی",
    crmUrl: ""
  };
  var QUICK_KEYS = ["Shift", "Control", "Alt", "off"];
  function cleanCrmUrl(raw) {
    if (typeof raw !== "string") return "";
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== "https:" || !/(^|\.)crm\.systan\.com$/i.test(u.hostname) || u.username || u.password) return "";
      return (u.origin + u.pathname.replace(/\/+$/, "")).slice(0, 300);
    } catch {
      return "";
    }
  }
  var mergeQuickConfig = (raw) => {
    const c = { ...QUICK_DEFAULTS, ...raw && typeof raw === "object" ? raw : {} };
    if (!QUICK_KEYS.includes(c.startKey)) c.startKey = QUICK_DEFAULTS.startKey;
    if (!QUICK_KEYS.includes(c.endKey)) c.endKey = QUICK_DEFAULTS.endKey;
    if (c.startKey !== "off" && c.startKey === c.endKey) c.endKey = "off";
    const ms = Number(c.tapMs);
    c.tapMs = Number.isFinite(ms) ? Math.min(800, Math.max(200, Math.round(ms))) : QUICK_DEFAULTS.tapMs;
    c.enabled = c.enabled !== false;
    c.openForm = c.openForm === true;
    c.mainPriceList = typeof c.mainPriceList === "string" && c.mainPriceList.trim() ? c.mainPriceList.trim() : QUICK_DEFAULTS.mainPriceList;
    c.crmUrl = cleanCrmUrl(c.crmUrl);
    return c;
  };
  var QUICK_STORAGE_KEY = "quickCfg";
  var QUICK_URL_KEY = "quickCrmUrl";
  var PORTAL_DEFAULTS = { enabled: true, allowSignup: true, welcomeSms: true, sessionMinutes: 20, notesMode: "marked", currencyLabel: "ریال" };
  var mergePortalConfig = (raw) => {
    const c = { ...PORTAL_DEFAULTS, ...raw && typeof raw === "object" ? raw : {} };
    const m = Number(c.sessionMinutes);
    c.sessionMinutes = Number.isFinite(m) ? Math.min(120, Math.max(2, Math.round(m))) : PORTAL_DEFAULTS.sessionMinutes;
    c.enabled = c.enabled !== false;
    c.allowSignup = c.allowSignup !== false;
    c.welcomeSms = c.welcomeSms !== false;
    c.notesMode = c.notesMode === "all" ? "all" : "marked";
    c.currencyLabel = typeof c.currencyLabel === "string" ? c.currencyLabel.trim().slice(0, 12) : PORTAL_DEFAULTS.currencyLabel;
    return c;
  };
  var PORTAL_STORAGE_KEY = "portalCfg";

  // src/shared/text.ts
  var toLatinDigits = (s) => String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15));
  var pad = (n, width = 2) => String(n).padStart(width, "0");
  var errorMessage = (e) => e instanceof Error ? e.message : String(e);

  // src/session-manager/concurrency.ts
  var KeyedMutex = class {
    tails = /* @__PURE__ */ new Map();
    run(key, fn) {
      const prev = this.tails.get(key) ?? Promise.resolve();
      const next = prev.then(fn, fn);
      const tail = next.catch(() => void 0);
      this.tails.set(key, tail);
      void tail.then(() => {
        if (this.tails.get(key) === tail) this.tails.delete(key);
      });
      return next;
    }
  };

  // src/session-manager/types.ts
  var SM_SCHEMA_VERSION = 1;
  var SESSION_STATES = [
    "IDLE",
    "RUNNING",
    "PAUSING",
    "PAUSED",
    "RESUMING",
    "COMPLETED",
    "FAILED",
    "CANCELLING",
    "CANCELLED",
    "RECOVERY_REQUIRED"
  ];
  var TERMINAL_STATES = ["COMPLETED", "FAILED", "CANCELLED"];
  var isTerminal = (s) => TERMINAL_STATES.includes(s);
  var SmError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
      this.name = "SmError";
    }
  };

  // src/session-manager/storage.ts
  var P = "sm.v1.";
  var KEY = {
    meta: P + "meta",
    idx: P + "idx",
    hb: P + "hb",
    session: (id) => P + "s." + id,
    quarantine: (id) => P + "q." + id,
    prefix: P,
    sessionPrefix: P + "s."
  };
  var ChromeStorageAdapter = class {
    get area() {
      return chrome.storage.local;
    }
    get(keys) {
      return this.area.get(keys);
    }
    async set(items) {
      try {
        await this.area.set(items);
      } catch (e) {
        throw toStorageError(e);
      }
    }
    remove(keys) {
      return this.area.remove(keys);
    }
    async keys() {
      const a = this.area;
      if (typeof a.getKeys === "function") return a.getKeys();
      return Object.keys(await this.area.get(null));
    }
  };
  function toStorageError(e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new SmError(/quota/i.test(msg) ? "STORAGE_FULL" : "STORAGE_FAILED", "ذخیره‌سازی ناموفق بود: " + msg);
  }
  var LIMITS = { history: 100, errors: 50, pauses: 200, operations: 50, checkpoints: 5 };
  var isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  var num = (v) => typeof v === "number" && Number.isFinite(v);
  var numOrNull = (v) => v === null || num(v);
  function checksum(step, data) {
    const s = step + "|" + JSON.stringify(data ?? null);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  var checkpointValid = (c) => isObj(c) && typeof c.step === "string" && c.checksum === checksum(c.step, c.data);
  function validateRecord(raw) {
    if (!isObj(raw)) return null;
    const schema = raw.schema === void 0 ? 1 : raw.schema;
    if (!num(schema)) return null;
    if (schema > SM_SCHEMA_VERSION) return "newer";
    if (typeof raw.id !== "string" || !raw.id || typeof raw.type !== "string" || typeof raw.name !== "string") return null;
    if (!SESSION_STATES.includes(raw.state)) return null;
    if (!num(raw.rev) || !num(raw.createdAt) || !num(raw.lastActivityAt) || !num(raw.activeMs) || raw.activeMs < 0) return null;
    if (!numOrNull(raw.startedAt) || !numOrNull(raw.finishedAt) || !numOrNull(raw.runningSince) || !numOrNull(raw.progress)) return null;
    if (raw.externalRef !== null && typeof raw.externalRef !== "string") return null;
    const arr = (v) => Array.isArray(v) ? v : null;
    const cps = arr(raw.checkpoints), ops3 = arr(raw.operations), pauses = arr(raw.pauses), hist = arr(raw.history), errs = arr(raw.errors);
    if (!cps || !ops3 || !pauses || !hist || !errs || !isObj(raw.meta)) return null;
    if (raw.state === "RUNNING" && raw.runningSince === null) return null;
    return {
      ...raw,
      schema: SM_SCHEMA_VERSION,
      step: typeof raw.step === "string" ? raw.step : null,
      recovery: isObj(raw.recovery) && typeof raw.recovery.reason === "string" ? raw.recovery : null,
      checkpoints: cps.slice(-LIMITS.checkpoints),
      operations: ops3.slice(-LIMITS.operations),
      pauses: pauses.slice(-LIMITS.pauses),
      history: hist.slice(-LIMITS.history),
      errors: errs.slice(-LIMITS.errors)
    };
  }
  var SessionStore = class {
    constructor(adapter) {
      this.adapter = adapter;
    }
    /** All writes (index read-modify-write included) are serialised: two sessions created at once can never lose an index entry. */
    writes = new KeyedMutex();
    async readIndex() {
      const r = await this.adapter.get([KEY.idx]);
      const idx = r[KEY.idx];
      if (Array.isArray(idx) && idx.every((x) => typeof x === "string")) return idx;
      const ids = (await this.adapter.keys()).filter((k) => k.startsWith(KEY.sessionPrefix)).map((k) => k.slice(KEY.sessionPrefix.length));
      if (ids.length) await this.adapter.set({ [KEY.idx]: ids });
      return ids;
    }
    async ensureMeta() {
      const r = await this.adapter.get([KEY.meta]);
      const m = r[KEY.meta];
      if (!isObj(m) || m.schema !== SM_SCHEMA_VERSION) {
        if (!isObj(m) || !num(m.schema) || m.schema < SM_SCHEMA_VERSION) await this.adapter.set({ [KEY.meta]: { schema: SM_SCHEMA_VERSION, at: Date.now() } });
      }
    }
    async get(id) {
      const raw = (await this.adapter.get([KEY.session(id)]))[KEY.session(id)];
      if (raw === void 0) return null;
      const v = validateRecord(raw);
      if (v === null) {
        await this.quarantine(id, raw);
        throw new SmError("CORRUPT", "رکورد جلسه آسیب‌دیده است و قرنطینه شد.");
      }
      if (v === "newer") throw new SmError("CORRUPT", "رکورد جلسه با نسخهٔ جدیدتر افزونه ساخته شده است.");
      return v;
    }
    /** Writes `rec` (rev+1). `expectedRev` = rev read before; a different stored rev means someone else wrote meanwhile. */
    put(rec, expectedRev) {
      return this.writes.run("w", () => this.putLocked(rec, expectedRev));
    }
    async putLocked(rec, expectedRev) {
      if (expectedRev !== null) {
        const cur = (await this.adapter.get([KEY.session(rec.id)]))[KEY.session(rec.id)];
        if (isObj(cur) && num(cur.rev) && cur.rev !== expectedRev) throw new SmError("BUSY", "رکورد جلسه هم‌زمان تغییر کرده است؛ دوباره تلاش کنید.");
      }
      const next = { ...rec, rev: rec.rev + 1 };
      const idx = await this.readIndex();
      const items = { [KEY.session(rec.id)]: next };
      if (!idx.includes(rec.id)) items[KEY.idx] = [...idx, rec.id];
      await this.adapter.set(items);
      return next;
    }
    async list() {
      const ids = await this.readIndex();
      const raws = await this.adapter.get(ids.map(KEY.session));
      const out = { sessions: [], quarantined: [], skipped: [] };
      const missing = [];
      for (const id of ids) {
        const raw = raws[KEY.session(id)];
        if (raw === void 0) {
          missing.push(id);
          continue;
        }
        const v = validateRecord(raw);
        if (v === null) {
          await this.quarantine(id, raw);
          out.quarantined.push(id);
        } else if (v === "newer") out.skipped.push(id);
        else out.sessions.push(v);
      }
      if (missing.length) await this.writes.run("w", async () => {
        const cur = await this.readIndex();
        await this.adapter.set({ [KEY.idx]: cur.filter((i) => !missing.includes(i)) });
      });
      out.sessions.sort((a, b) => a.createdAt - b.createdAt);
      return out;
    }
    /** Moves a corrupt record aside (kept for diagnosis) and drops it from the index. Never silently destroys data. */
    quarantine(id, raw) {
      return this.writes.run("w", async () => {
        try {
          const idx = await this.readIndex();
          await this.adapter.set({ [KEY.quarantine(id)]: { at: Date.now(), raw }, [KEY.idx]: idx.filter((i) => i !== id) });
          await this.adapter.remove([KEY.session(id)]);
        } catch (e) {
          console.warn("session-manager: quarantine failed", e);
        }
      });
    }
    async heartbeats() {
      const hb = (await this.adapter.get([KEY.hb]))[KEY.hb];
      return isObj(hb) ? hb : {};
    }
    beat(id, ts) {
      return this.writes.run("w", async () => {
        const hb = await this.heartbeats();
        hb[id] = ts;
        await this.adapter.set({ [KEY.hb]: hb });
      });
    }
    /** Removes finished sessions older than `maxAgeMs` (only this module's own keys). Returns removed ids. */
    async purge(now, maxAgeMs, keepAtMost = 200) {
      const { sessions } = await this.list();
      const done = sessions.filter((s) => isTerminal(s.state)).sort((a, b) => (a.finishedAt ?? a.createdAt) - (b.finishedAt ?? b.createdAt));
      const victims = done.filter((s, i) => now - (s.finishedAt ?? s.createdAt) > maxAgeMs || done.length - i > keepAtMost).map((s) => s.id);
      if (!victims.length) return [];
      return this.writes.run("w", async () => {
        const idx = await this.readIndex();
        const hb = await this.heartbeats();
        for (const id of victims) delete hb[id];
        await this.adapter.set({ [KEY.idx]: idx.filter((i) => !victims.includes(i)), [KEY.hb]: hb });
        await this.adapter.remove(victims.map(KEY.session));
        return victims;
      });
    }
  };

  // src/session-manager/checkpoint.ts
  var SECRET_KEY = /pass(word)?|token|secret|authorization|cookie|credential|apikey|api_key/i;
  var MAX_BYTES = 16 * 1024;
  function assertCheckpointData(data, depth = 0) {
    if (depth > 6) throw new SmError("INVALID_ARGUMENT", "ساختار داده‌ی نقطه‌ی بازیابی بیش از حد عمیق است.");
    if (data && typeof data === "object") {
      for (const [k, v] of Object.entries(data)) {
        if (SECRET_KEY.test(k)) throw new SmError("INVALID_ARGUMENT", "ذخیره‌ی اطلاعات احراز هویت در نقطه‌ی بازیابی مجاز نیست: " + k);
        assertCheckpointData(v, depth + 1);
      }
    }
    if (depth === 0 && JSON.stringify(data ?? null).length > MAX_BYTES) throw new SmError("INVALID_ARGUMENT", "حجم داده‌ی نقطه‌ی بازیابی بیش از حد است.");
  }
  function makeCheckpoint(rec, step, data, at) {
    assertCheckpointData(data);
    const seq = (rec.checkpoints[rec.checkpoints.length - 1]?.seq ?? 0) + 1;
    return { seq, at, step, data, checksum: checksum(step, data) };
  }
  function latestValidCheckpoint(rec) {
    if (!rec.checkpoints.length) return null;
    for (let i = rec.checkpoints.length - 1; i >= 0; i--) if (checkpointValid(rec.checkpoints[i])) return rec.checkpoints[i];
    return "corrupt";
  }

  // src/session-manager/clock.ts
  var activeMsAt = (rec, now) => rec.activeMs + (rec.state === "RUNNING" && rec.runningSince !== null ? Math.max(0, now - rec.runningSince) : 0);

  // src/session-manager/events.ts
  var SmEmitter = class {
    listeners = /* @__PURE__ */ new Set();
    seen = [];
    subscribe(fn) {
      this.listeners.add(fn);
      return () => {
        this.listeners.delete(fn);
      };
    }
    emit(type, rec, ts, reason, correlationId) {
      const eventId = `${rec.id}:${rec.rev}:${type}`;
      if (this.seen.includes(eventId)) return;
      this.seen.push(eventId);
      if (this.seen.length > 200) this.seen.shift();
      const e = { type, sessionId: rec.id, ts, eventId, payload: { state: rec.state, rev: rec.rev, ...reason ? { reason } : {} }, ...correlationId ? { correlationId } : {} };
      for (const fn of [...this.listeners]) {
        try {
          fn(e);
        } catch (err) {
          console.warn("session-manager listener failed:", err);
        }
      }
    }
  };

  // src/session-manager/registry.ts
  var SessionTypeRegistry = class {
    defs = /* @__PURE__ */ new Map();
    constructor(defs = []) {
      for (const d of defs) this.register(d);
    }
    register(def) {
      if (!/^[a-z][a-z0-9-]{1,40}$/.test(def.type)) throw new SmError("INVALID_ARGUMENT", "نوع جلسه نامعتبر است: " + def.type);
      this.defs.set(def.type, def);
    }
    get(type) {
      const d = this.defs.get(type);
      if (!d) throw new SmError("UNKNOWN_TYPE", "نوع جلسه ثبت نشده است: " + type);
      return d;
    }
    has(type) {
      return this.defs.has(type);
    }
  };
  var OPPORTUNITY_SESSION_TYPE = "opportunity-meeting";
  var defaultRegistry = () => new SessionTypeRegistry([
    { type: "generic", label: "جلسه عمومی", pausable: true },
    { type: OPPORTUNITY_SESSION_TYPE, label: "جلسهٔ فرصت", pausable: true }
  ]);

  // src/session-manager/state-machine.ts
  var TRANSITIONS = {
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
    CANCELLED: []
  };
  var canTransition = (from, to) => TRANSITIONS[from].includes(to);
  function assertTransition(from, to) {
    if (!canTransition(from, to)) throw new SmError("INVALID_TRANSITION", `انتقال نامعتبر: ${from} → ${to}`);
  }
  var allowedActions = (s) => ({
    pause: s === "RUNNING",
    resume: s === "PAUSED" || s === "RECOVERY_REQUIRED",
    cancel: s === "RUNNING" || s === "PAUSED" || s === "RECOVERY_REQUIRED" || s === "IDLE",
    end: s === "RUNNING" || s === "RECOVERY_REQUIRED"
  });

  // src/session-manager/manager.ts
  var EVENT_FOR_STATE = {
    RUNNING: "SESSION_STARTED",
    PAUSING: "SESSION_PAUSING",
    PAUSED: "SESSION_PAUSED",
    RESUMING: "SESSION_RESUMING",
    COMPLETED: "SESSION_COMPLETED",
    FAILED: "SESSION_FAILED",
    CANCELLED: "SESSION_CANCELLED",
    RECOVERY_REQUIRED: "SESSION_RECOVERY_REQUIRED"
  };
  var nonEmpty = (s, max, what) => {
    if (typeof s !== "string" || !s.trim() || s.length > max) throw new SmError("INVALID_ARGUMENT", `${what} نامعتبر است.`);
    return s.trim();
  };
  var SessionManager = class {
    events = new SmEmitter();
    registry;
    store;
    mutex = new KeyedMutex();
    now;
    newId;
    staleActivityMs;
    opStaleMs;
    retentionMs;
    constructor(o) {
      this.store = new SessionStore(o.storage);
      this.registry = o.registry ?? defaultRegistry();
      this.now = o.now ?? Date.now;
      this.newId = o.newId ?? (() => crypto.randomUUID());
      this.staleActivityMs = o.staleActivityMs ?? 12 * 36e5;
      this.opStaleMs = o.opStaleMs ?? 2 * 6e4;
      this.retentionMs = o.retentionMs ?? 30 * 864e5;
    }
    subscribe(fn) {
      return this.events.subscribe(fn);
    }
    // ───────────── internals ─────────────
    blank(id, type, name, externalRef, meta2, now) {
      return {
        schema: SM_SCHEMA_VERSION,
        id,
        type,
        name,
        externalRef,
        meta: meta2,
        state: "IDLE",
        rev: 0,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        lastActivityAt: now,
        activeMs: 0,
        runningSince: null,
        step: null,
        progress: null,
        checkpoints: [],
        operations: [],
        pauses: [],
        history: [],
        errors: [],
        recovery: null
      };
    }
    /** The ONLY place that changes `state`: validates the transition and keeps the clock consistent. */
    go(rec, to, now, ev, reason, freezeAt) {
      assertTransition(rec.state, to);
      const from = rec.state;
      if (from === "RUNNING" && rec.runningSince !== null) {
        rec.activeMs += Math.max(0, (freezeAt ?? now) - rec.runningSince);
        rec.runningSince = null;
      }
      if (to === "RUNNING") {
        rec.runningSince = now;
        rec.startedAt ??= now;
      }
      if (from === "RECOVERY_REQUIRED") rec.recovery = null;
      if (to === "RECOVERY_REQUIRED") rec.recovery = { reason: reason ?? "", at: now };
      if (isTerminal(to)) rec.finishedAt = now;
      rec.state = to;
      rec.lastActivityAt = now;
      rec.history.push({ at: now, from, to, ...reason ? { reason } : {} });
      const t = EVENT_FOR_STATE[to];
      if (t) ev.push({ type: t, ...reason ? { reason } : {} });
    }
    /** Serialised read-modify-write of one session. Events fire only after the record was persisted. */
    async tx(id, fn, correlationId) {
      if (typeof id !== "string" || !id) throw new SmError("INVALID_ARGUMENT", "شناسهٔ جلسه نامعتبر است.");
      return this.mutex.run(id, async () => {
        const cur = await this.store.get(id);
        if (!cur) throw new SmError("NOT_FOUND", "جلسه پیدا نشد.");
        const rec = structuredClone(cur);
        const ev = [];
        const now = this.now();
        if (fn(rec, now, ev) === "skip") return cur;
        const saved = await this.store.put(rec, cur.rev);
        for (const e of ev) this.events.emit(e.type, saved, now, e.reason, correlationId);
        return saved;
      });
    }
    inflight(rec) {
      return rec.operations.some((o) => o.status === "inflight");
    }
    // ───────────── creation ─────────────
    async create(input, correlationId) {
      this.registry.get(input.type);
      const name = nonEmpty(input.name, 200, "نام جلسه");
      const ext = input.externalRef == null ? null : nonEmpty(input.externalRef, 120, "شناسهٔ رکورد");
      const now = this.now();
      await this.store.ensureMeta();
      const rec = this.blank(input.id ?? this.newId(), input.type, name, ext, input.meta ?? {}, now);
      const saved = await this.mutex.run(rec.id, async () => {
        if (await this.store.get(rec.id)) throw new SmError("INVALID_ARGUMENT", "شناسهٔ جلسه تکراری است.");
        return this.store.put(rec, null);
      });
      this.events.emit("SESSION_CREATED", saved, now, void 0, correlationId);
      return input.autoStart ? this.start(saved.id, correlationId) : saved;
    }
    /**
     * Registers a session that already exists elsewhere (legacy localStorage session) WITHOUT changing it: idempotent per
     * (type, externalRef); the original start time is kept, so billing is identical to the legacy behaviour until a pause happens.
     */
    async adopt(input, correlationId) {
      this.registry.get(input.type);
      const ext = nonEmpty(input.externalRef, 120, "شناسهٔ رکورد");
      const name = nonEmpty(input.name, 200, "نام جلسه");
      return this.mutex.run("__adopt__", async () => {
        const { sessions } = await this.store.list();
        const same = sessions.filter((s) => s.type === input.type && s.externalRef === ext);
        const live = same.find((s) => !isTerminal(s.state));
        if (live) return live;
        const finished = same.sort((a, b) => b.createdAt - a.createdAt)[0];
        if (finished) return finished;
        const now = this.now();
        const started = Number.isFinite(input.startedAt) ? Math.min(input.startedAt, now) : now;
        await this.store.ensureMeta();
        const rec = this.blank(this.newId(), input.type, name, ext, input.meta ?? {}, now);
        const ev = [];
        this.go(rec, "RUNNING", started, ev, "adopted");
        rec.lastActivityAt = now;
        const saved = await this.store.put(rec, null);
        this.events.emit("SESSION_CREATED", saved, now, void 0, correlationId);
        this.events.emit("SESSION_STARTED", saved, now, "adopted", correlationId);
        return saved;
      });
    }
    // ───────────── lifecycle ─────────────
    start(id, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        if (rec.state === "RUNNING") return "skip";
        this.go(rec, "RUNNING", now, ev);
      }, correlationId);
    }
    /** Cooperative pause: the clock stops immediately; PAUSED is reached only when no operation is in flight. */
    pause(id, reason, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        if (rec.state === "PAUSING" || rec.state === "PAUSED") return "skip";
        if (!this.registry.get(rec.type).pausable) throw new SmError("INVALID_TRANSITION", "این نوع جلسه قابل توقف نیست.");
        this.go(rec, "PAUSING", now, ev, reason);
        rec.pauses.push({ pausedAt: now, ...reason ? { reason } : {} });
        if (!this.inflight(rec)) this.go(rec, "PAUSED", now, ev);
      }, correlationId);
    }
    resume(id, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        if (rec.state === "RUNNING" || rec.state === "RESUMING") return "skip";
        if (rec.state === "RECOVERY_REQUIRED") {
          this.go(rec, "RUNNING", now, ev, "recovered");
          ev.pop();
          ev.push({ type: "SESSION_RECOVERED" });
          return;
        }
        this.go(rec, "RESUMING", now, ev);
        const cp = latestValidCheckpoint(rec);
        if (cp === "corrupt") {
          this.go(rec, "RECOVERY_REQUIRED", now, ev, "نقطه‌ی بازیابی معتبر پیدا نشد");
          return;
        }
        if (cp) rec.step = cp.step;
        const open = [...rec.pauses].reverse().find((p) => p.resumedAt === void 0);
        if (open) open.resumedAt = now;
        this.go(rec, "RUNNING", now, ev, "resumed");
        ev.pop();
        ev.push({ type: "SESSION_RESUMED" });
      }, correlationId);
    }
    cancel(id, reason, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        if (rec.state === "CANCELLING" || rec.state === "CANCELLED") return "skip";
        if (rec.state === "RUNNING" || rec.state === "PAUSING") {
          this.go(rec, "CANCELLING", now, ev, reason);
          if (!this.inflight(rec)) this.go(rec, "CANCELLED", now, ev);
        } else this.go(rec, "CANCELLED", now, ev, reason);
      }, correlationId);
    }
    complete(id, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        if (rec.state === "COMPLETED") return "skip";
        this.go(rec, "COMPLETED", now, ev);
      }, correlationId);
    }
    fail(id, message, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        if (rec.state === "FAILED") return "skip";
        rec.errors.push({ at: now, message: String(message).slice(0, 500), ...rec.step ? { step: rec.step } : {} });
        this.go(rec, "FAILED", now, ev, String(message).slice(0, 200));
      }, correlationId);
    }
    // ───────────── progress / checkpoints / heartbeat ─────────────
    updateProgress(id, p, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        if (isTerminal(rec.state)) throw new SmError("INVALID_TRANSITION", "جلسه پایان یافته است.");
        if (p.progress !== void 0) {
          if (p.progress !== null && !Number.isFinite(p.progress)) throw new SmError("INVALID_ARGUMENT", "درصد پیشرفت نامعتبر است.");
          rec.progress = p.progress === null ? null : Math.min(100, Math.max(0, p.progress));
        }
        if (p.step !== void 0) rec.step = p.step === null ? null : nonEmpty(p.step, 120, "مرحله");
        rec.lastActivityAt = now;
        ev.push({ type: "SESSION_PROGRESS_UPDATED" });
      }, correlationId);
    }
    saveCheckpoint(id, step, data, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        if (!["RUNNING", "PAUSING", "RESUMING", "RECOVERY_REQUIRED"].includes(rec.state)) throw new SmError("INVALID_TRANSITION", "در این وضعیت نقطه‌ی بازیابی ذخیره نمی‌شود.");
        assertCheckpointData(data);
        const cp = makeCheckpoint(rec, nonEmpty(step, 120, "مرحله"), data, now);
        rec.checkpoints = [...rec.checkpoints, cp].slice(-5);
        rec.step = cp.step;
        rec.lastActivityAt = now;
        ev.push({ type: "SESSION_CHECKPOINT_SAVED" });
      }, correlationId);
    }
    /** Heartbeat: proves the user/panel is alive. Stored apart from the record (no rev bump, no UI churn). */
    async touch(id) {
      const rec = await this.store.get(id);
      if (rec && !isTerminal(rec.state)) await this.store.beat(id, this.now());
    }
    // ───────────── operations (idempotency, cooperative pause points, record locks) ─────────────
    /**
     * Declares the start of one execution unit. While it is in flight, Pause/Cancel wait (PAUSING/CANCELLING) instead of
     * interrupting it. The same `key` is never executed twice once done; the same CRM `recordKey` is never touched by two
     * sessions at once.
     */
    async beginOperation(id, input) {
      const key = nonEmpty(input.key, 160, "کلید عملیات");
      const label = nonEmpty(input.label, 120, "عنوان عملیات");
      const recordKey = input.recordKey ? nonEmpty(input.recordKey, 160, "کلید رکورد") : void 0;
      return this.mutex.run("__ops__", async () => {
        const now = this.now();
        const all = await this.store.list();
        const me = all.sessions.find((s) => s.id === id);
        if (!me) throw new SmError("NOT_FOUND", "جلسه پیدا نشد.");
        if (me.state !== "RUNNING" && me.state !== "RECOVERY_REQUIRED") return { ok: false, reason: "state", state: me.state };
        const prev = me.operations.find((o) => o.key === key);
        if (prev?.status === "done") return { ok: false, reason: "already-done", state: me.state };
        if (prev?.status === "inflight" && now - prev.startedAt < this.opStaleMs) return { ok: false, reason: "inflight", state: me.state };
        if (recordKey) {
          const holder = all.sessions.find((s) => s.id !== id && !isTerminal(s.state) && s.operations.some((o) => o.recordKey === recordKey && o.status === "inflight" && now - o.startedAt < this.opStaleMs));
          if (holder) return { ok: false, reason: "record-locked", state: me.state, holder: holder.id };
        }
        const hadUnknown = prev?.status === "unknown";
        let activeMs = 0;
        await this.tx(id, (rec, n) => {
          rec.operations = rec.operations.filter((o) => o.key !== key);
          rec.operations.push({ key, label, status: "inflight", startedAt: n, ...recordKey ? { recordKey } : {} });
          rec.operations = rec.operations.slice(-50);
          rec.lastActivityAt = n;
          activeMs = activeMsAt(rec, n);
        });
        return { ok: true, activeMs, hadUnknown };
      });
    }
    /** Ends one execution unit and settles any pending Pause/Cancel (the safe suspension point). */
    endOperation(id, key, r, correlationId) {
      return this.tx(id, (rec, now, ev) => {
        const op = rec.operations.find((o) => o.key === key);
        if (!op) throw new SmError("INVALID_ARGUMENT", "عملیات پیدا نشد.");
        op.status = r.ok ? "done" : "failed";
        op.finishedAt = now;
        if (!r.ok) {
          op.error = String(r.error ?? "").slice(0, 300);
          rec.errors.push({ at: now, message: op.error || "عملیات ناموفق بود", step: op.label });
        }
        rec.lastActivityAt = now;
        if (this.inflight(rec)) return;
        if (r.ok && r.finalize && !isTerminal(rec.state)) {
          this.go(rec, "COMPLETED", now, ev, "finalised");
          return;
        }
        if (rec.state === "PAUSING") this.go(rec, "PAUSED", now, ev);
        else if (rec.state === "CANCELLING") this.go(rec, "CANCELLED", now, ev);
      }, correlationId);
    }
    /** Resolves an operation whose outcome was unknown after an interruption (after checking the CRM). */
    reconcileOperation(id, key, outcome, correlationId) {
      return this.tx(id, (rec, now) => {
        const op = rec.operations.find((o) => o.key === key);
        if (!op || op.status !== "unknown") throw new SmError("INVALID_ARGUMENT", "عملیات نیازمند تطبیق نیست.");
        op.status = outcome;
        op.finishedAt = now;
        rec.lastActivityAt = now;
      }, correlationId);
    }
    /** Cooperative check for long-running work: stop starting new units when this is true. */
    async shouldYield(id) {
      const rec = await this.store.get(id);
      return !rec || ["PAUSING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED", "COMPLETED"].includes(rec.state);
    }
    // ───────────── queries ─────────────
    async get(id) {
      return this.store.get(id);
    }
    async listDetailed() {
      return this.store.list();
    }
    async list(filter) {
      const { sessions } = await this.store.list();
      return sessions.filter((s) => (!filter?.state || s.state === filter.state) && (!filter?.type || s.type === filter.type));
    }
    async getStatus(id) {
      const rec = await this.store.get(id);
      if (!rec) throw new SmError("NOT_FOUND", "جلسه پیدا نشد.");
      return { state: rec.state, activeMs: activeMsAt(rec, this.now()), step: rec.step, progress: rec.progress, actions: allowedActions(rec.state) };
    }
    // ───────────── global controls (always through the per-session rules) ─────────────
    async bulk(pick, act) {
      const targets = (await this.store.list()).sessions.filter(pick);
      return Promise.all(targets.map(async (s) => {
        try {
          await act(s.id);
          return { id: s.id, ok: true };
        } catch (e) {
          return { id: s.id, ok: false, code: e instanceof SmError ? e.code : "STORAGE_FAILED", message: e instanceof Error ? e.message : String(e) };
        }
      }));
    }
    pauseAll() {
      return this.bulk((s) => s.state === "RUNNING", (id) => this.pause(id, "pause-all"));
    }
    /** Resumes PAUSED sessions only; sessions needing recovery are resumed consciously, one by one. */
    resumeAll() {
      return this.bulk((s) => s.state === "PAUSED", (id) => this.resume(id));
    }
    cancelAll() {
      return this.bulk((s) => !isTerminal(s.state) && s.state !== "CANCELLING", (id) => this.cancel(id, "cancel-all"));
    }
    // ───────────── recovery (service worker start, browser start, periodic sweep) ─────────────
    /**
     * Re-establishes a consistent state from persisted data only. RUNNING sessions simply keep running (their clock is a
     * stored timestamp, not a timer); only sessions that cannot be trusted any more are flagged RECOVERY_REQUIRED:
     * interrupted operations (outcome unknown, NOT repeated), and sessions with no activity for `staleActivityMs`.
     */
    async recover() {
      const report = { recovered: [], required: [], purged: [], quarantined: [] };
      const listed = await this.store.list();
      report.quarantined = listed.quarantined;
      const hb = await this.store.heartbeats();
      for (const s of listed.sessions) {
        if (isTerminal(s.state) || s.state === "IDLE" || s.state === "PAUSED" || s.state === "RECOVERY_REQUIRED") continue;
        try {
          await this.tx(s.id, (rec, now, ev) => {
            const stale = (o) => now - o.startedAt >= this.opStaleMs;
            const dead = rec.operations.filter((o) => o.status === "inflight" && stale(o));
            for (const o of dead) o.status = "unknown";
            const last = Math.max(rec.lastActivityAt, hb[rec.id] ?? 0);
            if (rec.state === "CANCELLING" && !this.inflight(rec)) {
              this.go(rec, "CANCELLED", now, ev, "recovered");
              report.recovered.push(rec.id);
              return;
            }
            if (rec.state === "PAUSING" && !this.inflight(rec)) {
              this.go(rec, "PAUSED", now, ev, "recovered");
              report.recovered.push(rec.id);
              return;
            }
            if (rec.state === "RESUMING" && !this.inflight(rec)) {
              const cp = latestValidCheckpoint(rec);
              if (cp !== "corrupt") {
                const open = [...rec.pauses].reverse().find((p) => p.resumedAt === void 0);
                if (open) open.resumedAt = now;
                this.go(rec, "RUNNING", now, ev, "recovered");
                ev.pop();
                ev.push({ type: "SESSION_RECOVERED" });
                report.recovered.push(rec.id);
                return;
              }
            }
            if (dead.length) {
              this.go(rec, "RECOVERY_REQUIRED", now, ev, "عملیات نیمه‌تمام ماند؛ نتیجهٔ آن نامشخص است", last);
              report.required.push(rec.id);
              return;
            }
            if (rec.state === "RUNNING" && !this.inflight(rec) && now - last > this.staleActivityMs) {
              this.go(rec, "RECOVERY_REQUIRED", now, ev, "بی‌فعالیتی طولانی؛ زمان تا آخرین فعالیت ثبت شد", last);
              report.required.push(rec.id);
              return;
            }
            if (!dead.length) return "skip";
          });
        } catch (e) {
          console.warn("session-manager: recovery of", s.id, "failed:", e);
        }
      }
      try {
        report.purged = await this.store.purge(this.now(), this.retentionMs);
      } catch (e) {
        console.warn("session-manager: purge failed:", e);
      }
      return report;
    }
  };

  // src/session-manager/messages.ts
  var SM_OPS = [
    "create",
    "adopt",
    "start",
    "pause",
    "resume",
    "cancel",
    "complete",
    "fail",
    "touch",
    "get",
    "list",
    "progress",
    "checkpoint",
    "beginOp",
    "endOp",
    "reconcile",
    "pauseAll",
    "resumeAll",
    "cancelAll",
    "recover"
  ];
  var NEEDS_ID = /* @__PURE__ */ new Set(["start", "pause", "resume", "cancel", "complete", "fail", "touch", "get", "progress", "checkpoint", "beginOp", "endOp", "reconcile"]);
  var bad = (m) => {
    throw new SmError("INVALID_ARGUMENT", "پیام نامعتبر: " + m);
  };
  var isObj2 = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  var str = (o, k, max = 200) => {
    const v = o[k];
    if (typeof v !== "string" || !v || v.length > max) bad(k);
    return v;
  };
  var optStr = (o, k, max = 200) => o[k] === void 0 ? void 0 : str(o, k, max);
  var optBool = (o, k) => {
    if (o[k] === void 0) return void 0;
    if (typeof o[k] !== "boolean") bad(k);
    return o[k];
  };
  var meta = (o) => {
    const m = o.meta;
    if (m === void 0) return void 0;
    if (!isObj2(m) || Object.keys(m).length > 30) bad("meta");
    for (const v of Object.values(m)) if (!(v === null || ["string", "number", "boolean"].includes(typeof v))) bad("meta");
    return m;
  };
  var VALIDATORS = {
    create: (p) => ({ type: str(p, "type", 41), name: str(p, "name"), ...p.externalRef != null ? { externalRef: str(p, "externalRef", 120) } : {}, ...meta(p) ? { meta: meta(p) } : {}, ...optBool(p, "autoStart") !== void 0 ? { autoStart: optBool(p, "autoStart") } : {} }),
    adopt: (p) => {
      if (typeof p.startedAt !== "number" || !Number.isFinite(p.startedAt)) bad("startedAt");
      return { type: str(p, "type", 41), name: str(p, "name"), externalRef: str(p, "externalRef", 120), startedAt: p.startedAt, ...meta(p) ? { meta: meta(p) } : {} };
    },
    start: () => ({}),
    resume: () => ({}),
    complete: () => ({}),
    touch: () => ({}),
    get: () => ({}),
    list: () => ({}),
    pauseAll: () => ({}),
    resumeAll: () => ({}),
    cancelAll: () => ({}),
    recover: () => ({}),
    pause: (p) => ({ ...optStr(p, "reason", 120) ? { reason: optStr(p, "reason", 120) } : {} }),
    cancel: (p) => ({ ...optStr(p, "reason", 120) ? { reason: optStr(p, "reason", 120) } : {} }),
    fail: (p) => ({ message: str(p, "message", 500) }),
    progress: (p) => {
      const out = {};
      if (p.progress !== void 0) {
        if (p.progress !== null && typeof p.progress !== "number") bad("progress");
        out.progress = p.progress;
      }
      if (p.step !== void 0) out.step = p.step === null ? null : str(p, "step", 120);
      return out;
    },
    checkpoint: (p) => {
      if (!isObj2(p.data)) bad("data");
      return { step: str(p, "step", 120), data: p.data };
    },
    beginOp: (p) => ({ key: str(p, "key", 160), label: str(p, "label", 120), ...optStr(p, "recordKey", 160) ? { recordKey: optStr(p, "recordKey", 160) } : {} }),
    endOp: (p) => {
      if (typeof p.ok !== "boolean") bad("ok");
      return { key: str(p, "key", 160), ok: p.ok, ...optStr(p, "error", 300) ? { error: optStr(p, "error", 300) } : {}, ...optBool(p, "finalize") !== void 0 ? { finalize: optBool(p, "finalize") } : {} };
    },
    reconcile: (p) => {
      if (p.outcome !== "done" && p.outcome !== "failed") bad("outcome");
      return { key: str(p, "key", 160), outcome: p.outcome };
    }
  };
  function parseRequest(raw) {
    if (!isObj2(raw) || raw.v !== 1) return bad("envelope");
    const op = raw.op;
    if (typeof op !== "string" || !SM_OPS.includes(op)) return bad("op");
    if (typeof raw.ts !== "number" || !Number.isFinite(raw.ts)) return bad("ts");
    const corr = raw.correlationId;
    if (corr !== void 0 && (typeof corr !== "string" || corr.length > 80)) return bad("correlationId");
    const sessionId = raw.sessionId ?? null;
    if (sessionId !== null && (typeof sessionId !== "string" || !sessionId || sessionId.length > 80)) return bad("sessionId");
    if (NEEDS_ID.has(op) && sessionId === null) return bad("sessionId");
    const payload = raw.payload === void 0 ? {} : raw.payload;
    if (!isObj2(payload)) return bad("payload");
    const validated = VALIDATORS[op](payload);
    return { v: 1, op, sessionId, ts: raw.ts, ...corr ? { correlationId: corr } : {}, payload: validated };
  }
  var failure = (e, correlationId) => ({
    ok: false,
    code: e instanceof SmError ? e.code : "UNAVAILABLE",
    message: e instanceof Error ? e.message : String(e),
    ...correlationId ? { correlationId } : {}
  });

  // src/session-manager/service.ts
  var singleton = null;
  var getManager = () => singleton ??= new SessionManager({ storage: new ChromeStorageAdapter() });
  async function run(m, r) {
    const id = r.sessionId;
    const c = r.correlationId;
    switch (r.op) {
      case "create":
        return m.create(r.payload, c);
      case "adopt":
        return m.adopt(r.payload, c);
      case "start":
        return m.start(id, c);
      case "pause":
        return m.pause(id, r.payload.reason, c);
      case "resume":
        return m.resume(id, c);
      case "cancel":
        return m.cancel(id, r.payload.reason, c);
      case "complete":
        return m.complete(id, c);
      case "fail":
        return m.fail(id, r.payload.message, c);
      case "touch":
        await m.touch(id);
        return null;
      case "get":
        return m.get(id);
      case "list": {
        const l = await m.listDetailed();
        return { sessions: l.sessions, quarantined: l.quarantined.length };
      }
      case "progress":
        return m.updateProgress(id, r.payload, c);
      case "checkpoint":
        return m.saveCheckpoint(id, r.payload.step, r.payload.data, c);
      case "beginOp":
        return m.beginOperation(id, r.payload);
      case "endOp":
        return m.endOperation(id, r.payload.key, r.payload, c);
      case "reconcile":
        return m.reconcileOperation(id, r.payload.key, r.payload.outcome, c);
      case "pauseAll":
        return m.pauseAll();
      case "resumeAll":
        return m.resumeAll();
      case "cancelAll":
        return m.cancelAll();
      case "recover":
        return m.recover();
    }
  }
  async function handleSmMessage(raw, manager = getManager()) {
    let req;
    try {
      req = parseRequest(raw);
      return { ok: true, data: await run(manager, req), ...req.correlationId ? { correlationId: req.correlationId } : {} };
    } catch (e) {
      if (!(e instanceof SmError)) console.warn("session-manager request failed:", e);
      return failure(e, req?.correlationId);
    }
  }
  var SWEEP_ALARM = "dy-sm-sweep";
  function installSessionManager(manager = getManager) {
    const sweep = (why) => {
      manager().recover().catch((e) => console.warn("session-manager recovery (" + why + ") failed:", e));
    };
    sweep("worker-start");
    try {
      chrome.runtime.onStartup.addListener(() => sweep("browser-start"));
      chrome.runtime.onInstalled.addListener(() => sweep("installed"));
      if (chrome.alarms) {
        chrome.alarms.onAlarm.addListener((a) => {
          if (a.name === SWEEP_ALARM) sweep("alarm");
        });
        void chrome.alarms.get(SWEEP_ALARM).then((a) => {
          if (!a) chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 15, delayInMinutes: 15 });
        });
      }
    } catch (e) {
      console.warn("session-manager: could not register recovery hooks:", e);
    }
  }

  // src/shared/xrm.ts
  function requireXrm() {
    const xrm = window.Xrm;
    if (!xrm) throw new Error("Xrm در دسترس نیست.");
    return xrm;
  }
  var cleanId = (id) => id.replace(/[{}]/g, "").toLowerCase();
  var clientUrl = () => requireXrm().Utility.getGlobalContext().getClientUrl();

  // src/shared/odata.ts
  var ApiError = class extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  };
  var transport = { base: clientUrl, credentials: "same-origin" };
  var setApiTransport = (t) => {
    transport = t;
  };
  async function api(path, opts = {}) {
    const isAbsolute = /^https?:\/\//i.test(path);
    const base2 = await transport.base();
    const url = isAbsolute ? path : base2 + "/api/data/v9.1/" + path;
    if (isAbsolute && path.indexOf(base2 + "/") !== 0) throw new Error("Refusing cross-origin request: " + path);
    const res = await fetch(url, {
      credentials: transport.credentials,
      ...opts,
      headers: {
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        ...opts.headers
      }
    });
    if (!res.ok) {
      let msg = res.status + " " + res.statusText;
      try {
        const j = await res.json();
        msg = j.error?.message || msg;
      } catch {
      }
      throw new ApiError(msg, res.status);
    }
    if (res.status === 204) return null;
    if (/text\/html/i.test(res.headers?.get?.("content-type") ?? "")) throw new ApiError("به CRM وارد نشده‌اید؛ یک تب CRM را باز کنید و وارد شوید.", 401);
    return await res.json();
  }
  async function apiAll(path, opts = {}, maxPages = 20) {
    const out = [];
    let next = path;
    for (let i = 0; next && i < maxPages; i++) {
      const r = await api(next, opts);
      out.push(...r.value ?? []);
      next = r["@odata.nextLink"];
    }
    return out;
  }

  // src/close/constants.ts
  var NUM_FIELD = "new_opportunitynumbertext";
  var NUM_LEGACY = "new_opportunitynumber";
  var NUM_MAX_ATTEMPTS = 6;
  var NUM_MAX_SEQ = 9999;
  var END_PRODUCT = "INT-009";

  // src/shared/jalali.ts
  var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  var div = (a, b) => ~~(a / b);
  var mod = (a, b) => a - ~~(a / b) * b;
  function jalCal(jy) {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = BREAKS[0];
    let jump = 0;
    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error("Invalid Persian year " + jy);
    for (let i = 1; i < bl; i += 1) {
      const jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
  }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    let k = jdn - g2d(gy, 3, r.march);
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }
  var PC = { g2d, d2g, j2d, d2j };
  var TEHRAN_TZ = "Asia/Tehran";
  var TEHRAN_FALLBACK_OFFSET_MS = 126e5;
  function tehranOffsetMs(date) {
    try {
      const p = {};
      new Intl.DateTimeFormat("en-US", {
        timeZone: TEHRAN_TZ,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
      }).formatToParts(date).forEach((x) => {
        p[x.type] = x.value;
      });
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date.getTime() / 1e3) * 1e3;
    } catch {
      return TEHRAN_FALLBACK_OFFSET_MS;
    }
  }
  function tehranYmd(date) {
    const t = new Date(date.getTime() + tehranOffsetMs(date));
    return { gy: t.getUTCFullYear(), gm: t.getUTCMonth() + 1, gd: t.getUTCDate() };
  }
  function tehranMidnightUtc(gy, gm, gd) {
    const wall = Date.UTC(gy, gm - 1, gd);
    let t = wall - TEHRAN_FALLBACK_OFFSET_MS;
    t = wall - tehranOffsetMs(new Date(t));
    t = wall - tehranOffsetMs(new Date(t));
    return new Date(t);
  }
  function persianMonthOf(date) {
    const g = tehranYmd(date);
    const j = PC.d2j(PC.g2d(g.gy, g.gm, g.gd));
    return { jy: j.jy, jm: j.jm };
  }
  function persianMonthBounds(jy, jm) {
    const at = (y, m) => {
      const g = PC.d2g(PC.j2d(y, m, 1));
      return tehranMidnightUtc(g.gy, g.gm, g.gd);
    };
    return { start: at(jy, jm), end: jm === 12 ? at(jy + 1, 1) : at(jy, jm + 1) };
  }
  var isoUtc = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  function parseJalali(raw) {
    const t = toLatinDigits(raw).trim();
    const parts = /\D/.test(t) ? t.split(/\D+/) : [t.slice(0, 4), t.slice(4, 6), t.slice(6)];
    if (parts.length !== 3) return null;
    const [jy, jm, jd] = parts.map(Number);
    const ok = jy >= 1200 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= (jm <= 6 ? 31 : 30);
    return ok ? { jy, jm, jd } : null;
  }

  // src/close/opp-number.ts
  var numPrefix = (jy, jm) => String(jy % 10) + pad(jm, 2);
  var numFormat = (jy, jm, seq) => numPrefix(jy, jm) + pad(seq, 4);
  var NumberCollisionError = class extends Error {
    code = "COLLISION";
    constructor(message) {
      super(message);
      this.name = "NumberCollisionError";
    }
  };
  var numMetaP = null;
  function numMeta() {
    if (!numMetaP) {
      numMetaP = (async () => {
        let a;
        try {
          a = await api("EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='" + NUM_FIELD + "')");
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) throw new Error("فیلد " + NUM_FIELD + " در موجودیت opportunity پیدا نشد.");
          throw new Error("خواندن متادیتای فیلد " + NUM_FIELD + " ناموفق بود: " + errorMessage(e));
        }
        const yes = (v) => v === true || typeof v === "object" && v !== null && v.Value === true;
        const type = String(a.AttributeType || a.AttributeTypeName && a.AttributeTypeName.Value || "").replace(/Type$/, "");
        const isStr = /^(String|Memo)$/i.test(type);
        const isNum = /^(Integer|BigInt|Decimal|Double)$/i.test(type);
        if (!isStr && !isNum) throw new Error("نوع داده‌ی فیلد " + NUM_FIELD + " (" + (type || "؟") + ") برای شماره‌ی عددی پشتیبانی نمی‌شود.");
        if (!yes(a.IsValidForUpdate)) throw new Error("فیلد " + NUM_FIELD + " قابل ویرایش نیست (IsValidForUpdate=false).");
        if (isStr && a.MaxLength != null && a.MaxLength < 7) throw new Error("حداکثر طول فیلد " + NUM_FIELD + " کمتر از ۷ نویسه است.");
        return { numeric: isNum, type };
      })();
      numMetaP.catch(() => {
        numMetaP = null;
      });
    }
    return numMetaP;
  }
  var numValue = (meta2, s) => meta2.numeric ? Number(s) : s;
  var numLiteral = (meta2, s) => meta2.numeric ? String(Number(s)) : "'" + String(s).replace(/'/g, "''") + "'";
  async function fetchMonthRows(b) {
    const filter = "createdon ge " + isoUtc(b.start) + " and createdon lt " + isoUtc(b.end);
    let url = "opportunities?$select=opportunityid," + NUM_FIELD + "," + NUM_LEGACY + ",createdon&$filter=" + encodeURIComponent(filter);
    const rows = [];
    for (let guard = 0; url; guard++) {
      if (guard > 400) throw new Error("تعداد صفحه‌های نتیجه بیش از حد مجاز است.");
      const r = await api(url, { headers: { Prefer: "odata.maxpagesize=5000" } });
      rows.push(...r.value || []);
      url = r["@odata.nextLink"] || null;
    }
    return rows;
  }
  async function findHolders(meta2, number, exceptId) {
    const filter = NUM_FIELD + " eq " + numLiteral(meta2, number) + (exceptId ? " and opportunityid ne " + exceptId : "");
    const r = await api("opportunities?$select=opportunityid,createdon,modifiedon&$top=50&$filter=" + encodeURIComponent(filter));
    return r.value || [];
  }
  var sortKey = (r, f) => [Date.parse(r[f]) || 0, cleanId(r.opportunityid)];
  var keyLess = (a, b) => a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
  var asText = (v) => v === null || v === void 0 ? "" : String(v);
  async function assignOpportunityNumber(oppId) {
    const id = cleanId(oppId);
    const meta2 = await numMeta();
    let own = null;
    const taken = /* @__PURE__ */ new Set();
    let collisions = 0;
    for (let attempt = 1; attempt <= NUM_MAX_ATTEMPTS; attempt++) {
      const rec = await api("opportunities(" + id + ")?$select=" + NUM_FIELD + ",createdon,modifiedon");
      const cur = asText(rec[NUM_FIELD]);
      if (cur && cur !== own) return { number: cur, existing: true, seq: null, attempts: attempt, collisions };
      if (!cur) own = null;
      const created = new Date(rec.createdon);
      if (isNaN(created.getTime())) throw new Error("createdon رکورد نامعتبر است.");
      const { jy, jm } = persianMonthOf(created);
      if (jy % 10 === 0 && meta2.numeric) throw new Error("فیلد عددی است و رقم سال (۰) صفر پیشین را نگه نمی‌دارد؛ فیلد باید از نوع متن باشد.");
      const prefix = numPrefix(jy, jm);
      const rows = await fetchMonthRows(persianMonthBounds(jy, jm));
      const me = sortKey(rec, "createdon");
      let rank = 1;
      const used = /* @__PURE__ */ new Set();
      for (const r of rows) {
        if (cleanId(r.opportunityid) === id) continue;
        if (keyLess(sortKey(r, "createdon"), me)) rank++;
        for (const f of [NUM_FIELD, NUM_LEGACY]) {
          const s = asText(r[f]);
          if (s.length === 7 && s.indexOf(prefix) === 0) used.add(parseInt(s.slice(3), 10));
        }
      }
      let seq = rank;
      let num2 = null;
      for (let probe2 = 0; probe2 < 30; probe2++) {
        while (used.has(seq) || taken.has(seq)) seq++;
        if (seq > NUM_MAX_SEQ) throw new Error("ظرفیت شماره‌ی این ماه (" + NUM_MAX_SEQ + ") پر شده است.");
        const cand = numFormat(jy, jm, seq);
        const dup = await findHolders(meta2, cand, id);
        if (!dup.length) {
          num2 = cand;
          break;
        }
        taken.add(seq);
      }
      if (!num2) throw new Error("شماره‌ی آزاد پیدا نشد (برخورد مکرر).");
      const headers = rec["@odata.etag"] ? { "If-Match": rec["@odata.etag"] } : {};
      try {
        await api("opportunities(" + id + ")", { method: "PATCH", headers, body: JSON.stringify({ [NUM_FIELD]: numValue(meta2, num2) }) });
      } catch (e) {
        if (e instanceof ApiError && e.status === 412) continue;
        throw e;
      }
      own = num2;
      const holders = await findHolders(meta2, num2, null);
      const mine = holders.find((x) => cleanId(x.opportunityid) === id);
      const others = holders.filter((x) => cleanId(x.opportunityid) !== id);
      if (mine && !others.length) return { number: num2, existing: false, seq, attempts: attempt, collisions };
      if (!mine) throw new Error("بعد از ثبت، شماره‌ی " + num2 + " روی رکورد دیده نشد.");
      const myKey = sortKey(mine, "modifiedon");
      if (others.every((o) => keyLess(myKey, sortKey(o, "modifiedon")))) return { number: num2, existing: false, seq, attempts: attempt, collisions: collisions + 1 };
      collisions++;
      taken.add(seq);
    }
    if (own) {
      try {
        const rec = await api("opportunities(" + id + ")?$select=" + NUM_FIELD);
        if (String(rec[NUM_FIELD]) === own) await api("opportunities(" + id + ")", { method: "PATCH", body: JSON.stringify({ [NUM_FIELD]: null }) });
      } catch (e) {
        console.warn("release duplicate number failed:", e);
      }
    }
    throw new NumberCollisionError("به دلیل برخورد مکرر با ایجاد هم‌زمان فرصت‌ها، شماره‌ی یکتا تأیید نشد.");
  }

  // src/close/records.ts
  var isPrintName = (name) => /پرینت|print/i.test(name ?? "");
  async function getCurrencyId() {
    try {
      const xrm = typeof window !== "undefined" ? window.Xrm : void 0;
      if (xrm) {
        const us = xrm.Utility.getGlobalContext().userSettings;
        if (us.transactionCurrency?.id) return cleanId(us.transactionCurrency.id);
        const u2 = await api("systemusers(" + cleanId(us.userId) + ")?$select=_transactioncurrencyid_value");
        return u2._transactioncurrencyid_value || null;
      }
      const me = await api("WhoAmI");
      const u = await api("systemusers(" + cleanId(me.UserId) + ")?$select=_transactioncurrencyid_value");
      return u._transactioncurrencyid_value || null;
    } catch {
      return null;
    }
  }
  async function newOpportunityBody(name, description, opts = {}) {
    const body = { name };
    if (description) body.description = description;
    let cur = null;
    if (opts.priceLevelId) {
      const pl = cleanId(opts.priceLevelId);
      body["pricelevelid@odata.bind"] = "/pricelevels(" + pl + ")";
      try {
        cur = (await api("pricelevels(" + pl + ")?$select=_transactioncurrencyid_value"))._transactioncurrencyid_value || null;
      } catch {
        cur = null;
      }
    }
    cur = cur || await getCurrencyId();
    if (cur) body["transactioncurrencyid@odata.bind"] = "/transactioncurrencies(" + cur + ")";
    return body;
  }
  async function createOpportunityRecord(name, opts = {}) {
    const body = await newOpportunityBody(name, void 0, opts);
    const rec = await api("opportunities", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
    const oppId = cleanId(rec.opportunityid);
    let number = null;
    let numErr = null;
    try {
      number = (await assignOpportunityNumber(oppId)).number;
    } catch (e) {
      numErr = e;
    }
    return { oppId, number, numErr };
  }
  async function priceInLevel(productId, uom, levelId) {
    const r = await api(
      "productpricelevels?$select=amount&$top=1&$filter=" + encodeURIComponent("_productid_value eq " + productId + " and _pricelevelid_value eq " + levelId + (uom ? " and _uomid_value eq " + uom : ""))
    );
    return r.value.length && r.value[0].amount != null ? r.value[0].amount : null;
  }
  async function postOpportunityProduct(oppId, productId, uom, quantity, price) {
    const body = {
      "opportunityid@odata.bind": "/opportunities(" + oppId + ")",
      "productid@odata.bind": "/products(" + productId + ")",
      quantity
    };
    if (uom) body["uomid@odata.bind"] = "/uoms(" + uom + ")";
    if (price != null) {
      body.priceperunit = price;
      body.ispriceoverridden = true;
    }
    const post2 = (b) => api("opportunityproducts", { method: "POST", body: JSON.stringify(b) });
    try {
      await post2({ bmsd_istaxmanualyset: true, ...body });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) await post2(body);
      else throw e;
    }
  }
  async function addEndProduct(oppId, minutes) {
    const pr = await api(
      "products?$select=productid,name,price,_defaultuomid_value&$top=1&$filter=" + encodeURIComponent("productnumber eq '" + END_PRODUCT + "'")
    );
    if (!pr.value.length) throw new Error("محصول با شناسه " + END_PRODUCT + " پیدا نشد.");
    const p = pr.value[0];
    const uom = p._defaultuomid_value;
    const dup = await api(
      "opportunityproducts?$select=opportunityproductid&$top=1&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId + " and _productid_value eq " + p.productid)
    );
    if (dup.value.length) return { name: p.name, already: true };
    const lines = await apiAll(
      "opportunityproducts?$select=productname,_productid_value&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId),
      { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } }
    );
    if (lines.length && lines.every((l) => isPrintName(l["_productid_value@OData.Community.Display.V1.FormattedValue"]) || isPrintName(l.productname))) {
      return { name: p.name, skippedPrint: true };
    }
    let price = p.price;
    try {
      const o = await api("opportunities(" + oppId + ")?$select=_pricelevelid_value");
      if (o._pricelevelid_value) {
        const r = await api(
          "productpricelevels?$select=amount&$top=1&$filter=" + encodeURIComponent("_productid_value eq " + p.productid + " and _pricelevelid_value eq " + o._pricelevelid_value + (uom ? " and _uomid_value eq " + uom : ""))
        );
        if (r.value.length && r.value[0].amount != null) price = r.value[0].amount;
      }
    } catch (e) {
      console.warn("price lookup:", e);
    }
    await postOpportunityProduct(oppId, p.productid, uom, minutes, price);
    return { name: p.name };
  }

  // src/shared/product-search.ts
  var FA = "۰۱۲۳۴۵۶۷۸۹";
  var AR = "٠١٢٣٤٥٦٧٨٩";
  var normQ = (s) => String(s || "").toLowerCase().replace(/[يىئ]/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا").replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/[‌​ـً-ٟ]/g, "").replace(/\s+/g, " ").trim();

  // src/quick/protocol.ts
  var GUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  var OPS = ["bootstrap", "prices", "start", "sessions", "end", "setUrl", "open"];
  var bad2 = (m) => {
    throw new Error("درخواست نامعتبر: " + m);
  };
  var guid = (v, k) => {
    const s = typeof v === "string" ? v.replace(/[{}]/g, "").toLowerCase() : "";
    return GUID_RE.test(s) ? s : bad2(k);
  };
  function parseQuickRequest(raw) {
    if (!raw || typeof raw !== "object") return bad2("envelope");
    const r = raw;
    const op = r.op;
    if (typeof op !== "string" || !OPS.includes(op)) return bad2("op");
    switch (op) {
      case "bootstrap":
        return { op: "bootstrap", refresh: r.refresh === true };
      case "prices":
        return { op: "prices", priceLevelId: guid(r.priceLevelId, "priceLevelId") };
      case "sessions":
        return { op: "sessions" };
      case "end": {
        if (typeof r.sessionId !== "string" || !r.sessionId || r.sessionId.length > 80) return bad2("sessionId");
        return { op: "end", sessionId: r.sessionId };
      }
      case "setUrl":
        return { op: "setUrl", url: typeof r.url === "string" ? r.url.slice(0, 300) : "" };
      case "open":
        return { op: "open", oppId: guid(r.oppId, "oppId") };
      case "start": {
        const name = typeof r.name === "string" ? r.name.trim() : "";
        if (!name || name.length > 200) return bad2("name");
        const items = Array.isArray(r.items) ? r.items : bad2("items");
        if (items.length > 100) return bad2("items");
        return {
          op: "start",
          name,
          priceLevelId: r.priceLevelId == null ? null : guid(r.priceLevelId, "priceLevelId"),
          openForm: r.openForm === true,
          items: items.map((it) => {
            const o = it && typeof it === "object" ? it : {};
            const qty = Number(o.qty);
            if (!Number.isFinite(qty) || qty <= 0 || qty > 1e5) return bad2("qty");
            return { productId: guid(o.productId, "productId"), qty };
          })
        };
      }
    }
  }

  // src/background/quick.ts
  var PRODUCTS_KEY = "quickProducts";
  var PRODUCTS_TTL = 10 * 6e4;
  var loadQuickConfig = async () => {
    const r = await chrome.storage.local.get({ [QUICK_STORAGE_KEY]: {} });
    return mergeQuickConfig(r[QUICK_STORAGE_KEY]);
  };
  async function crmBase() {
    const cfg = await loadQuickConfig();
    const learned = (await chrome.storage.local.get({ [QUICK_URL_KEY]: "" }))[QUICK_URL_KEY];
    return cfg.crmUrl || cleanCrmUrl(learned) || DEFAULT_CRM_URL;
  }
  function installQuickTransport() {
    setApiTransport({ base: crmBase, credentials: "include" });
  }
  var memo = null;
  var loading = null;
  async function fetchProducts() {
    const rows = await apiAll(
      "products?$select=productid,name,productnumber,price,_defaultuomid_value&$filter=statecode eq 0&$orderby=name asc",
      { headers: { Prefer: 'odata.maxpagesize=5000, odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } },
      40
    );
    const list = rows.map((p) => ({
      id: String(p.productid),
      name: p.name || "",
      num: p.productnumber || "",
      price: p.price ?? null,
      uom: p._defaultuomid_value || null,
      uomName: p["_defaultuomid_value@OData.Community.Display.V1.FormattedValue"] || ""
    }));
    const c = { at: Date.now(), list };
    memo = c;
    try {
      await chrome.storage.local.set({ [PRODUCTS_KEY]: c });
    } catch {
    }
    return c;
  }
  async function products(refresh) {
    let cache = memo;
    if (!cache) {
      try {
        cache = (await chrome.storage.local.get(PRODUCTS_KEY))[PRODUCTS_KEY] ?? null;
      } catch {
        cache = null;
      }
      if (cache && !Array.isArray(cache.list)) cache = null;
      memo = cache;
    }
    const reload = () => loading ??= fetchProducts().finally(() => {
      loading = null;
    });
    if (cache && !refresh) {
      if (Date.now() - cache.at >= PRODUCTS_TTL) reload().catch(() => void 0);
      return { cache };
    }
    try {
      return { cache: await reload() };
    } catch (e) {
      return { cache, error: errorMessage(e) };
    }
  }
  async function priceLevels() {
    const rows = await apiAll("pricelevels?$select=pricelevelid,name&$filter=statecode eq 0&$orderby=name asc");
    return rows.map((r) => ({ id: String(r.pricelevelid), name: r.name || "" }));
  }
  function pickMainPriceLevel(levels, wanted) {
    const w = normQ(wanted);
    if (!w) return null;
    return (levels.find((l) => normQ(l.name) === w) ?? levels.find((l) => normQ(l.name).includes(w)))?.id ?? null;
  }
  var liveSessions = async () => {
    const now = Date.now();
    return (await getManager().list({ type: OPPORTUNITY_SESSION_TYPE })).filter((r) => !isTerminal(r.state) && r.externalRef).sort((a, b) => (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt)).map((r) => ({
      id: r.id,
      oppId: r.externalRef,
      name: r.name,
      number: typeof r.meta.number === "string" ? r.meta.number : null,
      state: r.state,
      startedAt: r.startedAt,
      activeMs: activeMsAt(r, now)
    }));
  };
  var ops = {
    async bootstrap({ refresh }) {
      const cfg = await loadQuickConfig();
      const [levels, prod] = await Promise.all([priceLevels(), products(refresh === true)]);
      return {
        crmUrl: await crmBase(),
        priceLevels: levels,
        mainPriceLevelId: pickMainPriceLevel(levels, cfg.mainPriceList),
        products: prod.cache?.list ?? [],
        productsAt: prod.cache?.at ?? 0,
        ...prod.error ? { productsError: prod.error } : {}
      };
    },
    async prices({ priceLevelId }) {
      const rows = await apiAll(
        "productpricelevels?$select=amount,_productid_value,_uomid_value&$filter=" + encodeURIComponent("_pricelevelid_value eq " + priceLevelId),
        { headers: { Prefer: "odata.maxpagesize=5000" } },
        40
      );
      const out = {};
      for (const r of rows) {
        if (r.amount == null || !r._productid_value) continue;
        out[r._productid_value + "|" + (r._uomid_value || "")] = r.amount;
        out[r._productid_value] ??= r.amount;
      }
      return out;
    },
    async sessions() {
      return { sessions: await liveSessions() };
    },
    async start({ name, priceLevelId, items, openForm }) {
      const opp = await createOpportunityRecord(name, { priceLevelId });
      const res = {
        oppId: opp.oppId,
        number: opp.number,
        sessionId: null,
        added: 0,
        lineErrors: [],
        ...opp.numErr ? { numberError: errorMessage(opp.numErr) } : {}
      };
      try {
        const rec = await getManager().create({
          type: OPPORTUNITY_SESSION_TYPE,
          name: name.slice(0, 200),
          externalRef: opp.oppId,
          ...opp.number ? { meta: { number: opp.number } } : {},
          autoStart: true
        });
        res.sessionId = rec.id;
      } catch (e) {
        res.sessionError = errorMessage(e);
      }
      if (items.length) {
        const cache = (await products(false)).cache?.list ?? [];
        for (const it of items) {
          const known = cache.find((p) => p.id.toLowerCase() === it.productId);
          try {
            let p = known;
            if (!p) {
              const r = await api("products(" + it.productId + ")?$select=productid,name,price,_defaultuomid_value");
              p = { id: it.productId, name: r.name || "", num: "", price: r.price ?? null, uom: r._defaultuomid_value || null, uomName: "" };
            }
            let price = p.price;
            if (priceLevelId) {
              try {
                price = await priceInLevel(p.id, p.uom, priceLevelId) ?? price;
              } catch (e) {
                console.warn("price lookup:", e);
              }
            }
            try {
              await postOpportunityProduct(opp.oppId, p.id, p.uom, it.qty, price);
              res.added++;
            } catch (e) {
              res.lineErrors.push({ name: p.name || it.productId, message: errorMessage(e) });
            }
          } catch (e) {
            res.lineErrors.push({ name: known?.name || it.productId, message: errorMessage(e) });
          }
        }
      }
      if (openForm) await ops.open({ oppId: opp.oppId }).catch(() => void 0);
      return res;
    },
    async end({ sessionId }) {
      const m = getManager();
      const rec = await m.get(sessionId);
      if (!rec || rec.type !== OPPORTUNITY_SESSION_TYPE || !rec.externalRef) throw new Error("جلسه پیدا نشد.");
      const oppId = rec.externalRef;
      const key = "end-product:" + oppId;
      const b = await m.beginOperation(rec.id, { key, label: "افزودن محصول پایان جلسه", recordKey: "opportunity:" + oppId });
      if (!b.ok) {
        if (b.reason === "state") throw new Error(isTerminal(b.state) ? "این جلسه قبلاً پایان یافته است." : "جلسه متوقف است؛ برای پایان، ابتدا آن را ادامه دهید (از پنل جلسه در CRM).");
        if (b.reason === "inflight") throw new Error("پایان این جلسه هم‌اکنون در حال انجام است.");
        if (b.reason === "record-locked") throw new Error("این فرصت هم‌زمان توسط جلسهٔ دیگری به‌روزرسانی می‌شود؛ چند لحظه بعد دوباره تلاش کنید.");
        throw new Error("پایان جلسه این‌بار ممکن نیست؛ دوباره تلاش کنید.");
      }
      const minutes = Math.max(1, Math.ceil(b.activeMs / 6e4));
      let r;
      try {
        r = await addEndProduct(oppId, minutes);
      } catch (e) {
        await m.endOperation(rec.id, key, { ok: false, error: errorMessage(e).slice(0, 280) }).catch(() => void 0);
        throw new Error("افزودن محصول ناموفق بود: " + errorMessage(e) + "\nجلسه هنوز باز است؛ دوباره تلاش کنید.");
      }
      await m.endOperation(rec.id, key, { ok: true, finalize: true });
      return { minutes, productName: r.name, already: r.already === true, skippedPrint: r.skippedPrint === true };
    },
    async setUrl({ url }) {
      const crmUrl = cleanCrmUrl(url);
      if (!crmUrl) throw new Error("آدرس CRM نامعتبر است.");
      await chrome.storage.local.set({ [QUICK_URL_KEY]: crmUrl });
      return { crmUrl };
    },
    async open({ oppId }) {
      await chrome.tabs.create({ url: await crmBase() + "/main.aspx?etn=opportunity&pagetype=entityrecord&id=" + oppId });
      return {};
    }
  };
  async function handleQuick(raw) {
    try {
      const req = parseQuickRequest(raw);
      const { op, ...payload } = req;
      return { ok: true, data: await ops[op](payload) };
    } catch (e) {
      if (!(e instanceof SmError) && !(e instanceof Error)) console.warn("quick:", e);
      return { ok: false, message: errorMessage(e) };
    }
  }

  // src/kyc/helpers.ts
  var digits = (s) => toLatinDigits(s).replace(/\D/g, "");
  var clean = (v) => {
    if (typeof v !== "string") return v;
    const t = v.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim();
    return t === "" || t.toLowerCase() === "null" ? void 0 : t;
  };
  var compact = (o) => {
    const out = {};
    for (const [k, raw] of Object.entries(o)) {
      const v = clean(raw);
      if (v != null && v !== "") out[k] = String(v);
    }
    return out;
  };
  function validNationalCode(c) {
    if (!/^\d{10}$/.test(c) || /^(\d)\1{9}$/.test(c)) return false;
    const r = [...c].slice(0, 9).reduce((s, d, i) => s + Number(d) * (10 - i), 0) % 11;
    return Number(c[9]) === (r < 2 ? r : 11 - r);
  }
  function parseMobile(raw) {
    let d = digits(raw);
    if (d.startsWith("0098")) d = d.slice(4);
    else if (d.length === 12 && d.startsWith("98")) d = d.slice(2);
    if (d.startsWith("0")) d = d.slice(1);
    return /^9\d{9}$/.test(d) ? d : null;
  }
  var oq = (v) => v.replace(/'/g, "''");

  // src/kyc/person-map.ts
  var titleFieldName = (configured) => configured && /^[a-z_0-9]+$/i.test(configured) ? configured : DEFAULTS.titleField;
  function mapPerson(p, cfg, code, jalali) {
    const optionValue = (v, fallback) => /^\d+$/.test(String(v).trim()) ? String(v).trim() : fallback;
    const raw = p.gender;
    const rawStr = raw === null || raw === void 0 ? "" : String(raw).trim().toLowerCase();
    let title;
    if (rawStr === "1" || rawStr === "true" || rawStr === "male") title = optionValue(cfg.titleMale, DEFAULTS.titleMale);
    else if (rawStr === "0" || rawStr === "false" || rawStr === "female") title = optionValue(cfg.titleFemale, DEFAULTS.titleFemale);
    else throw new Error(`جنسیت نامعتبر یا نامشخص از زحل دریافت شد (${String(raw)}). عنوان مخاطب را بررسی کنید.`);
    return compact({
      [titleFieldName(cfg.titleField)]: title,
      firstname: p.first_name,
      lastname: p.last_name,
      [CONTACT_FATHERNAME_FIELD]: p.father_name,
      [CONTACT_NATIONAL_FIELD]: code,
      [CONTACT_BIRTHDATE_FIELD]: jalali
    });
  }

  // src/portal/protocol.ts
  var OPS2 = [
    "status",
    "diagnose",
    "loginStart",
    "signupMobile",
    "signupKyc",
    "signupMobileSend",
    "signupIdentity",
    "otpVerify",
    "otpResend",
    "logout",
    "me",
    "dashboard",
    "list",
    "detail",
    "createTicket",
    "replyTicket",
    "createRequest",
    "updateProfile",
    "mobileChangeStart",
    "mobileChangeVerify"
  ];
  var LISTS = ["opportunities", "tickets", "quotes", "orders", "invoices", "activities"];
  var bad3 = (m) => {
    throw new Error("درخواست نامعتبر: " + m);
  };
  var str2 = (v, k, max, min = 1) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length >= min && s.length <= max ? s : bad3(k);
  };
  var opt = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
  var guid2 = (v, k) => {
    const s = typeof v === "string" ? v.replace(/[{}]/g, "").toLowerCase() : "";
    return GUID_RE.test(s) ? s : bad3(k);
  };
  var hex = (v, k) => typeof v === "string" && /^[0-9a-f]{32,64}$/.test(v) ? v : bad3(k);
  function parsePortalRequest(raw) {
    if (!raw || typeof raw !== "object") return bad3("envelope");
    const r = raw;
    const op = r.op;
    if (typeof op !== "string" || !OPS2.includes(op)) return bad3("op");
    switch (op) {
      case "status":
        return { op: "status" };
      case "diagnose":
        return { op: "diagnose" };
      case "loginStart": {
        if (r.method !== "mobile" && r.method !== "national") return bad3("method");
        return { op: "loginStart", method: r.method, value: str2(r.value, "value", 40) };
      }
      case "signupMobile":
        return { op: "signupMobile", mobile: str2(r.mobile, "mobile", 40) };
      case "signupKyc":
        return { op: "signupKyc", nationalCode: str2(r.nationalCode, "nationalCode", 20), birthDate: str2(r.birthDate, "birthDate", 20) };
      case "signupMobileSend":
        return { op: "signupMobileSend", flowId: hex(r.flowId, "flowId"), mobile: str2(r.mobile, "mobile", 40) };
      case "signupIdentity":
        return { op: "signupIdentity", flowId: hex(r.flowId, "flowId"), nationalCode: str2(r.nationalCode, "nationalCode", 20), birthDate: str2(r.birthDate, "birthDate", 20) };
      case "otpVerify":
        return { op: "otpVerify", flowId: hex(r.flowId, "flowId"), code: str2(r.code, "code", 12) };
      case "otpResend":
        return { op: "otpResend", flowId: hex(r.flowId, "flowId") };
      case "logout":
        return { op: "logout", token: hex(r.token, "token") };
      case "me":
        return { op: "me", token: hex(r.token, "token") };
      case "dashboard":
        return { op: "dashboard", token: hex(r.token, "token") };
      case "list": {
        const kind = typeof r.kind === "string" && LISTS.includes(r.kind) ? r.kind : bad3("kind");
        return { op: "list", token: hex(r.token, "token"), kind };
      }
      case "detail": {
        if (r.kind !== "opportunity" && r.kind !== "ticket") return bad3("kind");
        return { op: "detail", token: hex(r.token, "token"), kind: r.kind, id: guid2(r.id, "id") };
      }
      case "createTicket": {
        const p = Number(r.priority);
        return {
          op: "createTicket",
          token: hex(r.token, "token"),
          title: str2(r.title, "title", 200),
          description: opt(r.description, 4e3),
          priority: p === 1 || p === 3 ? p : 2
        };
      }
      case "replyTicket":
        return { op: "replyTicket", token: hex(r.token, "token"), id: guid2(r.id, "id"), text: str2(r.text, "text", 4e3) };
      case "createRequest":
        return { op: "createRequest", token: hex(r.token, "token"), title: str2(r.title, "title", 200), description: opt(r.description, 4e3) };
      case "updateProfile": {
        const p = r.patch && typeof r.patch === "object" ? r.patch : bad3("patch");
        const patch = {};
        const lim = [["email", 100], ["phone", 30], ["jobTitle", 100], ["address", 250], ["city", 80], ["postal", 20]];
        for (const [k, max] of lim) if (typeof p[k] === "string") patch[k] = p[k].trim().slice(0, max);
        return { op: "updateProfile", token: hex(r.token, "token"), patch };
      }
      case "mobileChangeStart":
        return { op: "mobileChangeStart", token: hex(r.token, "token"), mobile: str2(r.mobile, "mobile", 40) };
      case "mobileChangeVerify":
        return { op: "mobileChangeVerify", token: hex(r.token, "token"), flowId: hex(r.flowId, "flowId"), code: str2(r.code, "code", 12) };
    }
  }

  // src/background/providers.ts
  var sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  async function post(url, headers, body, failure2) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body)
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    } catch (e) {
      throw new Error(`${failure2}: ${errorMessage(e)}`);
    }
  }
  async function sendPattern(apiKey, pattern, mobile, params, label) {
    const { status, json } = await post(
      IPPANEL_URL,
      { Authorization: apiKey },
      { sending_type: "pattern", from_number: SENDER_NUMBER, code: pattern, recipients: [`+98${mobile}`], params },
      "اتصال به IPPanel ناموفق بود"
    );
    if (json?.meta?.status !== true) throw new Error(`[${label} • ${pattern}] ${json?.meta?.message || `خطای IPPanel (${status})`}`);
  }
  async function zohalCall(endpoint, body) {
    const { token } = await chrome.storage.local.get({ token: "" });
    if (!token) throw new Error("توکن زحل در تنظیمات افزونه وارد نشده است.");
    return post(`${ZOHAL_URL}/${endpoint}`, { Authorization: `Bearer ${token}` }, body, "اتصال به زحل ناموفق بود");
  }

  // src/background/portal.ts
  var PORTAL_PAGE = "portal.html";
  var NOTE_MARK = "[پورتال]";
  var OTP_TTL = 2 * 6e4;
  var OTP_COOLDOWN = 6e4;
  var OTP_MAX_TRIES = 3;
  var FLOW_TTL = 15 * 6e4;
  var FV = "@OData.Community.Display.V1.FormattedValue";
  var LIST_HEADERS = { Prefer: `odata.maxpagesize=100, odata.include-annotations="OData.Community.Display.V1.FormattedValue"` };
  var FA_FV = { headers: { Prefer: `odata.include-annotations="OData.Community.Display.V1.FormattedValue"` } };
  var AuthError = class extends Error {
  };
  var fail = (m) => {
    throw new Error(m);
  };
  var chain = Promise.resolve();
  function mutate(key, fn) {
    const run2 = async () => {
      const got = (await chrome.storage.session.get(key))[key];
      const m = got && typeof got === "object" ? got : {};
      const r = await fn(m);
      await chrome.storage.session.set({ [key]: m });
      return r;
    };
    const p = chain.then(run2, run2);
    chain = p.catch(() => void 0);
    return p;
  }
  var randomHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  async function loadPortalConfig() {
    return mergePortalConfig((await chrome.storage.local.get({ [PORTAL_STORAGE_KEY]: {} }))[PORTAL_STORAGE_KEY]);
  }
  var kycSettings = async () => await chrome.storage.local.get(DEFAULTS);
  var secrets = async () => await chrome.storage.local.get({ token: "", ippanelApiKey: "" });
  async function numberField() {
    const f = mergeInvoiceConfig((await chrome.storage.local.get({ [INVOICE_STORAGE_KEY]: {} }))[INVOICE_STORAGE_KEY]).numberField;
    return /^[a-z_0-9]+$/i.test(f) ? f : "new_opportunitynumbertext";
  }
  async function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const left = await mutate("portal:rate", (m) => {
      const list = (m[key] ?? []).filter((t) => now - t < windowMs);
      if (list.length >= max) {
        m[key] = list;
        return Math.ceil((list[0] + windowMs - now) / 6e4);
      }
      list.push(now);
      m[key] = list;
      return 0;
    });
    if (left) fail(`تعداد تلاش‌ها زیاد است؛ حدود ${left} دقیقهٔ دیگر دوباره امتحان کنید.`);
  }
  var masked = (m) => `0${m.slice(0, 3)}***${m.slice(-4)}`;
  var otpStep = (flowId, mobile, resendIn = OTP_COOLDOWN / 1e3) => ({ step: "otp", flowId, maskedMobile: masked(mobile), resendIn });
  async function sendOtp(flow) {
    const mobile = flow.mobile ?? fail("شماره موبایل مشخص نیست.");
    const now = Date.now();
    const wait = await mutate("portal:cool", (m) => {
      const w = Math.ceil(((m[mobile] ?? 0) + OTP_COOLDOWN - now) / 1e3);
      if (w > 0) return w;
      m[mobile] = now;
      return 0;
    });
    if (wait > 0) fail(`لطفاً ${wait} ثانیه دیگر دوباره تلاش کنید.`);
    const { ippanelApiKey } = await secrets();
    if (!ippanelApiKey) fail("کلید API IPPanel در تنظیمات افزونه وارد نشده است.");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0");
    try {
      await sendPattern(ippanelApiKey, OTP_PATTERN, mobile, { [OTP_PARAM_NAME]: code }, "OTP");
    } catch (e) {
      await mutate("portal:cool", (m) => {
        delete m[mobile];
      });
      throw e;
    }
    const hash = await sha256(`${mobile}:${code}`);
    await mutate("portal:flows", (m) => {
      const f = m[flow.id];
      if (f) f.otp = { hash, expires: now + OTP_TTL, tries: 0, sentAt: now };
    });
    flow.otp = { hash, expires: now + OTP_TTL, tries: 0, sentAt: now };
  }
  async function getFlow(id, kind) {
    const now = Date.now();
    const f = await mutate("portal:flows", (m) => {
      for (const k of Object.keys(m)) if (now - m[k].at > FLOW_TTL) delete m[k];
      return m[id] ? structuredClone(m[id]) : null;
    });
    if (!f || kind && f.kind !== kind) return fail("این مرحله منقضی شده است؛ از ابتدا شروع کنید.");
    return f;
  }
  var saveFlow = (f) => mutate("portal:flows", (m) => {
    m[f.id] = f;
  });
  var dropFlow = (id) => mutate("portal:flows", (m) => {
    delete m[id];
  });
  async function newFlow(init) {
    const f = { id: randomHex(16), at: Date.now(), ...init };
    await saveFlow(f);
    return f;
  }
  async function checkCode(flowId, code) {
    const f = await getFlow(flowId);
    const otp = f.otp;
    if (!otp || !f.mobile) return fail("ابتدا کد تایید را دریافت کنید.");
    if (Date.now() > otp.expires || otp.tries >= OTP_MAX_TRIES) {
      delete f.otp;
      await saveFlow(f);
      return fail("کد منقضی شده است؛ کد جدید دریافت کنید.");
    }
    const given = code.replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15)).replace(/\D/g, "");
    if (await sha256(`${f.mobile}:${given}`) !== otp.hash) {
      f.otp = { ...otp, tries: otp.tries + 1 };
      await saveFlow(f);
      return fail(f.otp.tries >= OTP_MAX_TRIES ? "کد اشتباه است؛ کد جدید دریافت کنید." : "کد تایید اشتباه است.");
    }
    delete f.otp;
    await saveFlow(f);
    return f;
  }
  async function openSession(contactId, mobile) {
    const token = randomHex(32);
    const now = Date.now();
    const idle = (await loadPortalConfig()).sessionMinutes * 6e4;
    await mutate("portal:sessions", (m) => {
      for (const k of Object.keys(m)) if (now - m[k].seen > idle) delete m[k];
      m[token] = { contactId, mobile, at: now, seen: now };
    });
    return token;
  }
  async function requireSession(token) {
    const idle = (await loadPortalConfig()).sessionMinutes * 6e4;
    const now = Date.now();
    const s = await mutate("portal:sessions", (m) => {
      const x = m[token];
      if (!x) return null;
      if (now - x.seen > idle) {
        delete m[token];
        return null;
      }
      x.seen = now;
      return { ...x };
    });
    if (!s) throw new AuthError("نشست شما به پایان رسیده است؛ دوباره وارد شوید.");
    return s;
  }
  var CONTACT_SELECT = [
    "contactid",
    "fullname",
    "firstname",
    "lastname",
    "mobilephone",
    "telephone1",
    "emailaddress1",
    "jobtitle",
    "address1_line1",
    "address1_city",
    "address1_postalcode",
    "createdon",
    "statecode",
    "_parentcustomerid_value",
    CONTACT_NATIONAL_FIELD,
    CONTACT_BIRTHDATE_FIELD,
    CONTACT_FATHERNAME_FIELD
  ].join(",");
  var mobileFilter = (mobile) => [`0${mobile}`, mobile, `+98${mobile}`, `98${mobile}`].map((m) => `mobilephone eq '${m}'`).join(" or ");
  var CONTACT_SELECT_MIN = ["contactid", "fullname", "firstname", "lastname", "mobilephone", "statecode", CONTACT_NATIONAL_FIELD].join(",");
  async function findContacts(filter, activeOnly) {
    const f = activeOnly ? `statecode eq 0 and (${filter})` : filter;
    const q = (select) => api(`contacts?$select=${select}&$top=3&$filter=${encodeURIComponent(f)}`, FA_FV);
    try {
      return (await q(CONTACT_SELECT)).value;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 400)) throw crmError("جستجوی مخاطب در CRM", e);
      try {
        return (await q(CONTACT_SELECT_MIN)).value;
      } catch (e2) {
        throw crmError("جستجوی مخاطب در CRM", e2);
      }
    }
  }
  function crmError(what, e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("[portal]", what, e);
    return new Error(`${what} ناموفق بود: ${m}`);
  }
  var byNational = (code, activeOnly) => findContacts(`${CONTACT_NATIONAL_FIELD} eq '${oq(code)}'`, activeOnly);
  var byMobile = (mobile, activeOnly) => findContacts(mobileFilter(mobile), activeOnly);
  var sstr = (v) => typeof v === "string" ? v : v == null ? "" : String(v);
  function toProfile(r) {
    const code = sstr(r[CONTACT_NATIONAL_FIELD]);
    const birth = sstr(r[CONTACT_BIRTHDATE_FIELD]);
    return {
      id: sstr(r.contactid),
      fullName: sstr(r.fullname),
      firstName: sstr(r.firstname),
      lastName: sstr(r.lastname),
      mobile: sstr(r.mobilephone),
      phone: sstr(r.telephone1),
      email: sstr(r.emailaddress1),
      jobTitle: sstr(r.jobtitle),
      address: sstr(r.address1_line1),
      city: sstr(r.address1_city),
      postal: sstr(r.address1_postalcode),
      company: sstr(r["_parentcustomerid_value" + FV]),
      fatherName: sstr(r[CONTACT_FATHERNAME_FIELD]),
      birthDate: birth,
      nationalMasked: code.length === 10 ? `${code.slice(0, 3)}*****${code.slice(-2)}` : "",
      verified: code.length === 10 && !!birth,
      createdOn: r.createdon ?? null
    };
  }
  async function loadProfile(contactId) {
    return toProfile(await api(`contacts(${contactId})?$select=${CONTACT_SELECT}`, FA_FV));
  }
  async function verifyIdentity(codeRaw, birthRaw) {
    const code = codeRaw.replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15)).replace(/\D/g, "");
    if (!validNationalCode(code)) fail("کد ملی معتبر نیست.");
    const b = parseJalali(birthRaw);
    if (!b) fail("تاریخ تولد معتبر نیست (مثال: 1377/06/30).");
    const jalali = `${b.jy}/${pad(b.jm)}/${pad(b.jd)}`;
    await rateLimit("kyc", 6, 10 * 6e4);
    const { json, status } = await zohalCall("national_identity_inquiry", { national_code: code, birth_date: jalali, gender: true });
    if (json?.result !== 1) fail(json?.response_body?.message || `خطا در استعلام زحل (${status})`);
    const p = Object.fromEntries(Object.entries(json.response_body?.data ?? {}).map(([k, v]) => [k, clean(v)]));
    if (!p.matched) fail("کد ملی و تاریخ تولد با هم مطابقت ندارند.");
    const payload = mapPerson(p, await kycSettings(), code, jalali);
    return { payload, first: payload.firstname ?? "", last: payload.lastname ?? "", code };
  }
  async function createContact(flow) {
    const person = flow.person ?? fail("مشخصات هویتی تایید نشده است.");
    const mobile = flow.mobile ?? fail("شماره موبایل تایید نشده است.");
    if ((await byNational(person.code, false)).length || (await byMobile(mobile, false)).length) {
      await dropFlow(flow.id);
      return { step: "exists" };
    }
    const titleKey = titleFieldName((await kycSettings()).titleField);
    const body = {};
    for (const [k, v] of Object.entries({ ...person.payload, mobilephone: `0${mobile}` })) body[k] = k === titleKey && /^\d+$/.test(v) ? Number(v) : v;
    let contactId = "";
    try {
      const rec = await api("contacts?$select=contactid", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body)
      });
      contactId = rec?.contactid ?? "";
    } catch (e) {
      throw crmError("ساخت مخاطب در CRM", e);
    }
    if (!contactId) contactId = sstr((await byNational(person.code, false))[0]?.contactid);
    if (!contactId) fail("مخاطب ساخته شد ولی شناسهٔ آن از CRM دریافت نشد؛ با پذیرش تماس بگیرید.");
    await dropFlow(flow.id);
    if ((await loadPortalConfig()).welcomeSms) {
      const { ippanelApiKey } = await secrets();
      if (ippanelApiKey) await sendPattern(ippanelApiKey, WELCOME_PATTERN, mobile, { FirstName: person.first, LastName: person.last }, "Welcome").catch((e) => console.warn("welcome sms:", e));
    }
    return { step: "done", token: await openSession(contactId, mobile), created: true };
  }
  var isoOrNull = (v) => typeof v === "string" && v ? v : null;
  var numOrNull2 = (v) => typeof v === "number" ? v : null;
  var fv = (r, f) => sstr(r[f + FV]);
  var TONES = {
    opportunities: ["open", "won", "lost"],
    tickets: ["open", "won", "lost"],
    quotes: ["open", "info", "won", "lost"],
    orders: ["open", "info", "lost", "won", "won"],
    invoices: ["open", "won", "won", "lost"],
    activities: ["open", "won", "lost"]
  };
  var toneOf = (kind, state) => TONES[kind][Number(state)] ?? "info";
  var base = (kind, r, id, extra) => ({
    id: sstr(r[id]),
    number: "",
    title: "",
    state: fv(r, "statecode"),
    tone: toneOf(kind, r.statecode),
    status: fv(r, "statuscode"),
    amount: null,
    createdOn: isoOrNull(r.createdon),
    modifiedOn: isoOrNull(r.modifiedon),
    ...extra
  });
  var SPECS = {
    opportunities: {
      set: "opportunities",
      id: "opportunityid",
      order: "modifiedon desc",
      select: ["opportunityid", "name", "statecode", "statuscode", "estimatedvalue", "actualvalue", "totalamount", "createdon", "modifiedon", "estimatedclosedate", "actualclosedate"],
      filter: (c) => `(_customerid_value eq ${c} or _parentcontactid_value eq ${c})`,
      map: (r, nf) => base("opportunities", r, "opportunityid", {
        number: sstr(r[nf]),
        title: sstr(r.name),
        amount: r.statecode === 1 ? numOrNull2(r.actualvalue) ?? numOrNull2(r.totalamount) : numOrNull2(r.estimatedvalue) ?? numOrNull2(r.totalamount),
        dueOn: isoOrNull(r.statecode === 1 ? r.actualclosedate : r.estimatedclosedate)
      })
    },
    tickets: {
      set: "incidents",
      id: "incidentid",
      order: "modifiedon desc",
      select: ["incidentid", "ticketnumber", "title", "statecode", "statuscode", "prioritycode", "createdon", "modifiedon"],
      filter: (c) => `_customerid_value eq ${c}`,
      map: (r) => base("tickets", r, "incidentid", { number: sstr(r.ticketnumber), title: sstr(r.title), priority: fv(r, "prioritycode") })
    },
    quotes: {
      set: "quotes",
      id: "quoteid",
      order: "createdon desc",
      select: ["quoteid", "quotenumber", "name", "statecode", "statuscode", "totalamount", "createdon", "modifiedon", "effectiveto"],
      filter: (c) => `_customerid_value eq ${c}`,
      map: (r) => base("quotes", r, "quoteid", { number: sstr(r.quotenumber), title: sstr(r.name), amount: numOrNull2(r.totalamount), dueOn: isoOrNull(r.effectiveto) })
    },
    orders: {
      set: "salesorders",
      id: "salesorderid",
      order: "createdon desc",
      select: ["salesorderid", "ordernumber", "name", "statecode", "statuscode", "totalamount", "createdon", "modifiedon"],
      filter: (c) => `_customerid_value eq ${c}`,
      map: (r) => base("orders", r, "salesorderid", { number: sstr(r.ordernumber), title: sstr(r.name), amount: numOrNull2(r.totalamount) })
    },
    invoices: {
      set: "invoices",
      id: "invoiceid",
      order: "createdon desc",
      select: ["invoiceid", "invoicenumber", "name", "statecode", "statuscode", "totalamount", "createdon", "modifiedon", "duedate"],
      filter: (c) => `_customerid_value eq ${c}`,
      map: (r) => base("invoices", r, "invoiceid", { number: sstr(r.invoicenumber), title: sstr(r.name), amount: numOrNull2(r.totalamount), dueOn: isoOrNull(r.duedate) })
    },
    activities: {
      set: "activitypointers",
      id: "activityid",
      order: "createdon desc",
      select: ["activityid", "subject", "activitytypecode", "statecode", "statuscode", "createdon", "modifiedon", "scheduledstart"],
      filter: (c) => `_regardingobjectid_value eq ${c}`,
      map: (r) => base("activities", r, "activityid", { title: sstr(r.subject), kind: fv(r, "activitytypecode"), dueOn: isoOrNull(r.scheduledstart) })
    }
  };
  async function listRows(kind, contactId, top = 400) {
    const spec = SPECS[kind];
    const nf = kind === "opportunities" ? await numberField() : "";
    const q = (select) => `${spec.set}?$select=${select.join(",")}&$filter=${encodeURIComponent(spec.filter(contactId))}&$orderby=${spec.order}`;
    let rows;
    try {
      rows = await apiAll(q(nf ? [...spec.select, nf] : spec.select), { headers: LIST_HEADERS }, Math.ceil(top / 100));
    } catch (e) {
      if (!(nf && e instanceof ApiError && e.status === 400)) throw e;
      rows = await apiAll(q(spec.select), { headers: LIST_HEADERS }, Math.ceil(top / 100));
    }
    return rows.slice(0, top).map((r) => spec.map(r, nf));
  }
  var owns = (r, contactId, fields) => fields.some((f) => sstr(r[f]).toLowerCase() === contactId);
  async function listNotes(objectId, all) {
    const rows = await apiAll(
      `annotations?$select=annotationid,subject,notetext,createdon,filename&$filter=${encodeURIComponent(`_objectid_value eq ${objectId}`)}&$orderby=createdon asc`,
      { headers: LIST_HEADERS },
      3
    );
    return rows.filter((r) => all || sstr(r.subject).startsWith(NOTE_MARK)).map((r) => {
      const subject = sstr(r.subject);
      const mine = subject.startsWith(NOTE_MARK);
      return {
        id: sstr(r.annotationid),
        subject: mine ? subject.slice(NOTE_MARK.length).trim() : subject,
        text: sstr(r.notetext),
        createdOn: isoOrNull(r.createdon),
        by: mine ? "شما" : "کارشناس",
        mine,
        ...r.filename ? { file: sstr(r.filename) } : {}
      };
    });
  }
  var snippet = (t) => (t.length > 1500 ? t.slice(0, 1500) + "…" : t) || "(بدنهٔ خالی)";
  async function probe(name, url, headers = {}) {
    try {
      const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0", ...headers } });
      const type = res.headers.get("content-type") ?? "";
      const text = await res.text().catch((e) => `(خواندن بدنه ناموفق: ${errorMessage(e)})`);
      const html = /text\/html/i.test(type);
      const head = `GET ${url}
HTTP ${res.status} ${res.statusText}${res.redirected ? `
ریدایرکت به: ${res.url}` : ""}
Content-Type: ${type || "-"}`;
      const hint = html ? "\n⚠ پاسخ HTML است، یعنی در این مرورگر به CRM وارد نشده‌اید (صفحهٔ ورود برگشته). یک تب CRM باز کنید و وارد شوید." : "";
      return { name, ok: res.ok && !html, detail: `${head}${hint}

${snippet(text)}` };
    } catch (e) {
      return { name, ok: false, detail: `GET ${url}
خطای شبکه: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}
(آدرس CRM، اینترنت/VPN یا مجوز host افزونه را بررسی کنید.)` };
    }
  }
  async function diagnose() {
    const base2 = await crmBase();
    const checks = [{ name: "آدرس CRM", ok: !!base2, detail: base2 || "آدرس CRM مشخص نیست؛ از تنظیمات افزونه وارد کنید." }];
    const who = await probe("ورود به CRM (WhoAmI)", `${base2}/api/data/v9.1/WhoAmI`);
    checks.push(who);
    if (who.ok) {
      checks.push(await probe("جستجوی مخاطب (فیلدهای پروفایل)", `${base2}/api/data/v9.1/contacts?$select=${CONTACT_SELECT}&$top=1`));
    } else {
      checks.push({ name: "جستجوی مخاطب (فیلدهای پروفایل)", ok: false, detail: "انجام نشد، چون ورود به CRM ناموفق بود." });
    }
    const s = await secrets();
    checks.push({ name: "کلید IPPanel (پیامک)", ok: !!s.ippanelApiKey, detail: s.ippanelApiKey ? "وارد شده است." : "در تنظیمات افزونه وارد نشده است." });
    checks.push({ name: "توکن زحل (استعلام هویت)", ok: !!s.token, detail: s.token ? "وارد شده است." : "در تنظیمات افزونه وارد نشده است." });
    return { ok: checks.every((c) => c.ok), base: base2, checks };
  }
  var PRIORITY_FIELDS = { 1: 1, 2: 2, 3: 3 };
  async function startLogin(method, value) {
    await rateLimit("login", 10, 10 * 6e4);
    let rows;
    if (method === "mobile") {
      const mobile2 = parseMobile(value) ?? fail("شماره موبایل معتبر نیست.");
      rows = await byMobile(mobile2, true);
      if (rows.length > 1) fail("چند پرونده با این شماره موبایل وجود دارد؛ با کد ملی وارد شوید.");
    } else {
      const code = value.replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15)).replace(/\D/g, "");
      if (!validNationalCode(code)) fail("کد ملی معتبر نیست.");
      rows = await byNational(code, true);
    }
    const row = rows[0];
    if (!row) return { step: "notFound" };
    const mobile = parseMobile(sstr(row.mobilephone));
    if (!mobile) return fail("برای این پرونده شمارهٔ موبایل معتبری ثبت نشده است؛ با پذیرش تماس بگیرید.");
    const flow = await newFlow({ kind: "login", contactId: sstr(row.contactid), mobile });
    await sendOtp(flow);
    return otpStep(flow.id, mobile);
  }
  var ops2 = {
    async status() {
      const [cfg, s] = await Promise.all([loadPortalConfig(), secrets()]);
      return { enabled: cfg.enabled, allowSignup: cfg.allowSignup, sessionMinutes: cfg.sessionMinutes, currency: cfg.currencyLabel, missing: [...s.token ? [] : ["zohal"], ...s.ippanelApiKey ? [] : ["sms"]] };
    },
    diagnose: () => diagnose(),
    loginStart: ({ method, value }) => startLogin(method, value),
    async signupMobile({ mobile: raw }) {
      if (!(await loadPortalConfig()).allowSignup) fail("ثبت‌نام از تنظیمات غیرفعال است.");
      await rateLimit("signup", 10, 10 * 6e4);
      const mobile = parseMobile(raw) ?? fail("شماره موبایل معتبر نیست.");
      if ((await byMobile(mobile, false)).length) return { step: "exists" };
      const flow = await newFlow({ kind: "signup", mobile });
      await sendOtp(flow);
      return otpStep(flow.id, mobile);
    },
    async signupKyc({ nationalCode, birthDate }) {
      if (!(await loadPortalConfig()).allowSignup) fail("ثبت‌نام از تنظیمات غیرفعال است.");
      const v = await verifyIdentity(nationalCode, birthDate);
      if ((await byNational(v.code, false)).length) return { step: "exists" };
      const flow = await newFlow({ kind: "signup", person: v });
      return { step: "mobile", flowId: flow.id, person: { firstName: v.first, lastName: v.last } };
    },
    async signupMobileSend({ flowId, mobile: raw }) {
      const flow = await getFlow(flowId, "signup");
      if (!flow.person || flow.mobileVerified) return fail("این مرحله معتبر نیست.");
      const mobile = parseMobile(raw) ?? fail("شماره موبایل معتبر نیست.");
      if ((await byMobile(mobile, false)).length) return { step: "exists" };
      flow.mobile = mobile;
      await saveFlow(flow);
      await sendOtp(flow);
      return otpStep(flow.id, mobile);
    },
    async signupIdentity({ flowId, nationalCode, birthDate }) {
      const flow = await getFlow(flowId, "signup");
      if (!flow.mobileVerified || flow.person) return fail("ابتدا شمارهٔ موبایل را تایید کنید.");
      const v = await verifyIdentity(nationalCode, birthDate);
      if ((await byNational(v.code, false)).length) {
        await dropFlow(flowId);
        return { step: "exists" };
      }
      flow.person = v;
      await saveFlow(flow);
      return createContact(flow);
    },
    async otpVerify({ flowId, code }) {
      const flow = await checkCode(flowId, code);
      if (flow.kind === "login") {
        await dropFlow(flow.id);
        return { step: "done", token: await openSession(flow.contactId, flow.mobile), created: false };
      }
      if (flow.kind === "signup") {
        flow.mobileVerified = true;
        await saveFlow(flow);
        return flow.person ? createContact(flow) : { step: "identity", flowId: flow.id };
      }
      return fail("این مرحله معتبر نیست.");
    },
    async otpResend({ flowId }) {
      const flow = await getFlow(flowId);
      if (!flow.mobile || flow.mobileVerified) return fail("ارسال دوباره ممکن نیست.");
      await sendOtp(flow);
      return otpStep(flow.id, flow.mobile);
    },
    async logout({ token }) {
      await mutate("portal:sessions", (m) => {
        delete m[token];
      });
      return {};
    },
    async me({ token }) {
      return loadProfile((await requireSession(token)).contactId);
    },
    async dashboard({ token }) {
      const { contactId } = await requireSession(token);
      const errors = [];
      const NAMES = { opportunities: "فرصت‌ها", tickets: "تیکت‌ها", quotes: "پیش‌فاکتورها", orders: "سفارش‌ها", invoices: "فاکتورها", activities: "فعالیت‌ها" };
      const get = async (k, top) => {
        try {
          return await listRows(k, contactId, top);
        } catch (e) {
          console.warn("portal list", k, e);
          errors.push(NAMES[k]);
          return [];
        }
      };
      const [profile, opps, tickets, quotes, orders, invoices, activity] = await Promise.all([
        loadProfile(contactId),
        get("opportunities", 400),
        get("tickets", 400),
        get("quotes", 200),
        get("orders", 200),
        get("invoices", 200),
        get("activities", 12)
      ]);
      const sum = (rows) => rows.reduce((s, r) => s + (r.amount ?? 0), 0);
      const open = opps.filter((r) => r.tone === "open");
      const won = opps.filter((r) => r.tone === "won");
      const out = {
        profile,
        stats: {
          openOpps: open.length,
          openOppsValue: sum(open),
          wonOpps: won.length,
          wonValue: sum(won),
          lostOpps: opps.filter((r) => r.tone === "lost").length,
          openTickets: tickets.filter((r) => r.tone === "open").length,
          resolvedTickets: tickets.filter((r) => r.tone === "won").length,
          quotes: quotes.length,
          orders: orders.length,
          invoices: invoices.length,
          invoicesTotal: sum(invoices)
        },
        recentOpps: opps.slice(0, 5),
        recentTickets: tickets.slice(0, 5),
        activity,
        errors
      };
      return out;
    },
    async list({ token, kind }) {
      const { contactId } = await requireSession(token);
      try {
        return { rows: await listRows(kind, contactId) };
      } catch (e) {
        if (e instanceof AuthError) throw e;
        return { rows: [], error: errorMessage(e) };
      }
    },
    async detail({ token, kind, id }) {
      const { contactId } = await requireSession(token);
      return kind === "ticket" ? ticketDetail(contactId, id) : opportunityDetail(contactId, id);
    },
    async createTicket({ token, title, description, priority }) {
      const { contactId } = await requireSession(token);
      const body = {
        title,
        description,
        prioritycode: PRIORITY_FIELDS[priority],
        "customerid_contact@odata.bind": `/contacts(${contactId})`
      };
      const post2 = (b) => api("incidents?$select=incidentid,ticketnumber", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(b) });
      let rec;
      try {
        rec = await post2({ ...body, caseorigincode: 3 });
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) rec = await post2(body);
        else throw e;
      }
      return { id: sstr(rec.incidentid), number: sstr(rec.ticketnumber) };
    },
    async replyTicket({ token, id, text }) {
      const { contactId } = await requireSession(token);
      const t = await api(`incidents(${id})?$select=incidentid,_customerid_value,statecode`).catch(() => null);
      if (!t || !owns(t, contactId, ["_customerid_value"])) return fail("تیکت پیدا نشد.");
      if (t.statecode !== 0) return fail("این تیکت بسته شده است؛ برای ادامه تیکت جدید ثبت کنید.");
      const rec = await api("annotations?$select=annotationid,createdon", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ subject: `${NOTE_MARK} پاسخ مشتری`, notetext: text, "objectid_incident@odata.bind": `/incidents(${id})` })
      });
      return { note: { id: sstr(rec.annotationid), subject: "پاسخ مشتری", text, createdOn: isoOrNull(rec.createdon), by: "شما", mine: true } };
    },
    async createRequest({ token, title, description }) {
      const { contactId } = await requireSession(token);
      const body = { ...await newOpportunityBody(title, description || void 0), "parentcontactid@odata.bind": `/contacts(${contactId})`, "customerid_contact@odata.bind": `/contacts(${contactId})` };
      const rec = await api("opportunities?$select=opportunityid", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
      const id = sstr(rec.opportunityid).toLowerCase();
      let number = null;
      try {
        number = (await assignOpportunityNumber(id)).number;
      } catch (e) {
        console.warn("opportunity number:", e);
      }
      return { id, number };
    },
    async updateProfile({ token, patch }) {
      const { contactId } = await requireSession(token);
      const body = profileBody(patch);
      if (Object.keys(body).length) await api(`contacts(${contactId})`, { method: "PATCH", headers: { "If-Match": "*" }, body: JSON.stringify(body) });
      return loadProfile(contactId);
    },
    async mobileChangeStart({ token, mobile: raw }) {
      const { contactId } = await requireSession(token);
      const mobile = parseMobile(raw) ?? fail("شماره موبایل معتبر نیست.");
      const owners = await byMobile(mobile, false);
      if (owners.some((o) => sstr(o.contactid).toLowerCase() !== contactId)) fail("این شماره برای مخاطب دیگری ثبت شده است.");
      const flow = await newFlow({ kind: "mobile", contactId, mobile });
      await sendOtp(flow);
      return otpStep(flow.id, mobile);
    },
    async mobileChangeVerify({ token, flowId, code }) {
      const { contactId } = await requireSession(token);
      const flow = await checkCode(flowId, code);
      if (flow.kind !== "mobile" || flow.contactId !== contactId) return fail("این مرحله معتبر نیست.");
      await dropFlow(flow.id);
      await api(`contacts(${contactId})`, { method: "PATCH", headers: { "If-Match": "*" }, body: JSON.stringify({ mobilephone: `0${flow.mobile}` }) });
      await mutate("portal:sessions", (m) => {
        const s = m[token];
        if (s) s.mobile = flow.mobile;
      });
      return loadProfile(contactId);
    }
  };
  function profileBody(p) {
    const out = {};
    const set = (k, field, fix = (v) => v) => {
      if (p[k] !== void 0) out[field] = fix(p[k]) || null;
    };
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) fail("نشانی ایمیل معتبر نیست.");
    const digits2 = (v) => v.replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15)).replace(/\D/g, "");
    if (p.postal && digits2(p.postal).length !== 10) fail("کد پستی باید ۱۰ رقم باشد.");
    set("email", "emailaddress1");
    set("phone", "telephone1", digits2);
    set("jobTitle", "jobtitle");
    set("address", "address1_line1");
    set("city", "address1_city");
    set("postal", "address1_postalcode", digits2);
    return out;
  }
  var fieldRows = (r, defs) => defs.map(([label, f]) => [label, fv(r, f) || sstr(r[f])]).filter(([, v]) => v);
  async function opportunityDetail(contactId, id) {
    const nf = await numberField();
    const sel = (n) => `opportunities(${id})?$select=opportunityid,name,statecode,statuscode,estimatedvalue,actualvalue,totalamount,closeprobability,estimatedclosedate,actualclosedate,createdon,modifiedon,_customerid_value,_parentcontactid_value,_ownerid_value,_pricelevelid_value${n ? "," + n : ""}`;
    let r;
    try {
      r = await api(sel(nf), FA_FV);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return fail("فرصت پیدا نشد.");
      r = await api(sel(""), FA_FV).catch(() => fail("فرصت پیدا نشد."));
    }
    if (!owns(r, contactId, ["_customerid_value", "_parentcontactid_value"])) return fail("فرصت پیدا نشد.");
    const row = SPECS.opportunities.map(r, nf);
    const lines = await apiAll(
      `opportunityproducts?$select=productname,quantity,priceperunit,extendedamount&$filter=${encodeURIComponent(`_opportunityid_value eq ${id}`)}`,
      FA_FV,
      3
    ).catch(() => []);
    const out = lines.map((l) => ({ name: sstr(l.productname) || fv(l, "_productid_value"), qty: numOrNull2(l.quantity), price: numOrNull2(l.priceperunit), total: numOrNull2(l.extendedamount) }));
    const notes = await listNotes(id, (await loadPortalConfig()).notesMode === "all").catch(() => []);
    return {
      row,
      description: "",
      lines: out,
      notes,
      fields: fieldRows(r, [["شماره", nf], ["وضعیت", "statuscode"], ["مبلغ تخمینی", "estimatedvalue"], ["مبلغ نهایی", "totalamount"], ["احتمال موفقیت", "closeprobability"], ["تاریخ پیش‌بینی بسته‌شدن", "estimatedclosedate"], ["تاریخ بسته‌شدن", "actualclosedate"], ["لیست قیمت", "_pricelevelid_value"], ["مسئول پیگیری", "_ownerid_value"], ["تاریخ ثبت", "createdon"]])
    };
  }
  async function ticketDetail(contactId, id) {
    const r = await api(
      `incidents(${id})?$select=incidentid,ticketnumber,title,description,statecode,statuscode,prioritycode,caseorigincode,createdon,modifiedon,_customerid_value,_ownerid_value`,
      FA_FV
    ).catch(() => null);
    if (!r || !owns(r, contactId, ["_customerid_value"])) return fail("تیکت پیدا نشد.");
    const notes = await listNotes(id, (await loadPortalConfig()).notesMode === "all").catch(() => []);
    return {
      row: SPECS.tickets.map(r, ""),
      description: sstr(r.description),
      lines: [],
      notes,
      fields: fieldRows(r, [["شمارهٔ تیکت", "ticketnumber"], ["وضعیت", "statuscode"], ["اولویت", "prioritycode"], ["کانال ثبت", "caseorigincode"], ["مسئول رسیدگی", "_ownerid_value"], ["تاریخ ثبت", "createdon"], ["آخرین تغییر", "modifiedon"]])
    };
  }
  async function handlePortal(raw) {
    try {
      const req = parsePortalRequest(raw);
      const { op, ...payload } = req;
      if (op !== "status" && op !== "diagnose" && !(await loadPortalConfig()).enabled) return { ok: false, code: "disabled", message: "پورتال مشتری از تنظیمات افزونه غیرفعال شده است." };
      return { ok: true, data: await ops2[op](payload) };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, code: "auth", message: e.message };
      return { ok: false, message: errorMessage(e) };
    }
  }
  function installPortal() {
    chrome.action?.onClicked.addListener(() => {
      void openPortalTab();
    });
  }
  async function openPortalTab() {
    const url = chrome.runtime.getURL(PORTAL_PAGE);
    const [existing] = await chrome.tabs.query({ url });
    if (existing?.id !== void 0) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId !== void 0) await chrome.windows.update(existing.windowId, { focused: true }).catch(() => void 0);
      return;
    }
    await chrome.tabs.create({ url });
  }

  // src/background/index.ts
  var OTP_TTL2 = 2 * 6e4;
  var OTP_COOLDOWN2 = 6e4;
  var OTP_MAX_TRIES2 = 3;
  var ZOHAL_ENDPOINTS = /* @__PURE__ */ new Set(["national_identity_inquiry", "company_inquiry"]);
  var isMobile = (m) => /^9\d{9}$/.test(m);
  var handlers = {
    async getConfig() {
      const config = await chrome.storage.local.get(DEFAULTS);
      config.contactNationalField = CONTACT_NATIONAL_FIELD;
      await chrome.storage.local.set({ contactNationalField: CONTACT_NATIONAL_FIELD });
      return { config };
    },
    async zohal({ endpoint, body }) {
      if (!ZOHAL_ENDPOINTS.has(endpoint)) throw new Error("endpoint نامعتبر است.");
      return zohalCall(endpoint, body);
    },
    // mobile = 10 digits without the leading 0, e.g. 9121234567
    async otpSend({ mobile }) {
      if (!isMobile(mobile)) throw new Error("شماره موبایل نامعتبر است.");
      const { lastSent = 0 } = await chrome.storage.session.get("lastSent");
      const wait = Math.ceil((lastSent + OTP_COOLDOWN2 - Date.now()) / 1e3);
      if (wait > 0) throw new Error(`لطفاً ${wait} ثانیه دیگر دوباره تلاش کنید.`);
      const { ippanelApiKey } = await chrome.storage.local.get({ ippanelApiKey: "" });
      if (!ippanelApiKey) throw new Error("کلید API IPPanel در تنظیمات افزونه وارد نشده است.");
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0");
      await sendPattern(ippanelApiKey, OTP_PATTERN, mobile, { [OTP_PARAM_NAME]: code }, "OTP");
      const now = Date.now();
      const otp = { mobile, hash: await sha256(`${mobile}:${code}`), expires: now + OTP_TTL2, tries: 0 };
      await chrome.storage.session.set({ lastSent: now, otp });
      return {};
    },
    // Welcome SMS after the contact was created
    async welcome({ mobile, firstname, lastname }) {
      if (!isMobile(mobile)) throw new Error("شماره موبایل نامعتبر است.");
      const { ippanelApiKey } = await chrome.storage.local.get({ ippanelApiKey: "" });
      if (!ippanelApiKey) throw new Error("کلید API IPPanel وارد نشده است.");
      await sendPattern(ippanelApiKey, WELCOME_PATTERN, mobile, { FirstName: firstname || "", LastName: lastname || "" }, "Welcome");
      return {};
    },
    async otpVerify({ mobile, code }) {
      const { otp } = await chrome.storage.session.get("otp");
      if (!otp || otp.mobile !== mobile) throw new Error("ابتدا کد تایید را دریافت کنید.");
      if (Date.now() > otp.expires || otp.tries >= OTP_MAX_TRIES2) {
        await chrome.storage.session.remove("otp");
        throw new Error("کد منقضی شده است؛ کد جدید دریافت کنید.");
      }
      if (await sha256(`${mobile}:${code}`) !== otp.hash) {
        await chrome.storage.session.set({ otp: { ...otp, tries: otp.tries + 1 } });
        throw new Error("کد تایید اشتباه است.");
      }
      await chrome.storage.session.remove("otp");
      return {};
    },
    // Session Manager (pause / resume / recovery); never rejects: failures are returned as { ok: false }
    sm({ req }) {
      return handleSmMessage(req);
    },
    // Quick session (popup on any website): CRM calls are made here with the browser's CRM cookies; never rejects
    quick({ req }) {
      return handleQuick(req);
    },
    // Customer portal (separate extension page): login / signup / profile / dashboard; never rejects, failures are { ok: false }
    portal({ req }) {
      return handlePortal(req);
    },
    // A frame (e.g. an iframe) saw the shortcut: the popup always opens in the top frame of that tab. Handled in the listener (needs the sender).
    async quickTrigger() {
      return {};
    }
  };
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    const handler = msg && handlers[msg.type];
    if (!handler) return;
    if (msg.type === "quickTrigger") {
      const tabId = _sender.tab?.id;
      if ((msg.which === "start" || msg.which === "end") && tabId !== void 0) {
        chrome.tabs.sendMessage(tabId, { type: "quickOpen", which: msg.which }, { frameId: 0 }).catch(() => void 0);
      }
      reply({});
      return;
    }
    handler(msg).then(reply, (e) => reply({ error: errorMessage(e) }));
    return true;
  });
  installQuickTransport();
  installPortal();
  installSessionManager();
})();
