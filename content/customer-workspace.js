"use strict";
(() => {
  // src/crm-workspace/crm-context.ts
  function getCrmApi() {
    const xrm = window.Xrm;
    if (!xrm?.WebApi) throw new Error("رابط Dynamics Xrm.WebApi در این صفحه در دسترس نیست.");
    return xrm.WebApi;
  }
  function getCurrentRecord() {
    const page = window.Xrm?.Page;
    if (!page?.data?.entity) throw new Error("فرم Dynamics بارگذاری نشده است.");
    const entity = page.data.entity.getEntityName();
    const id = page.data.entity.getId().replace(/[{}]/g, "").toLowerCase();
    if (!id) throw new Error("ابتدا یک رکورد ذخیره‌شده را باز کنید.");
    return { entity, id };
  }

  // src/crm-workspace/services/contact.service.ts
  var SELECT = "contactid,firstname,lastname,fullname,mobilephone,telephone1,emailaddress1,jobtitle,company,systan_nationalcode,systan_nationalidbase,systan_fathername,systan_fathersname,systan_birthdatefa,birthdate,gendercode,statecode,statuscode,createdon,modifiedon";
  var contactService = {
    get(id) {
      return getCrmApi().retrieveRecord("contact", id, `?$select=${SELECT}`);
    },
    update(id, data) {
      return getCrmApi().updateRecord("contact", id, data);
    },
    create(data) {
      return getCrmApi().createRecord("contact", data);
    }
  };

  // src/crm-workspace/services/opportunity.service.ts
  var opportunityService = {
    async byContact(contactId) {
      const id = contactId.replace(/[{}]/g, "");
      return getCrmApi().retrieveMultipleRecords("opportunity", `?$select=opportunityid,name,estimatedvalue,actualvalue,statecode,statuscode,createdon,estimatedclosedate&$filter=_customerid_value eq ${id}&$orderby=createdon desc&$top=50`);
    }
  };

  // src/crm-workspace/services/activity.service.ts
  var activityService = {
    async byContact(contactId) {
      const id = contactId.replace(/[{}]/g, "");
      return getCrmApi().retrieveMultipleRecords("activitypointer", `?$select=activityid,subject,activitytypecode,statecode,statuscode,scheduledstart,scheduledend,actualstart,createdon,description&$filter=_regardingobjectid_value eq ${id}&$orderby=createdon desc&$top=50`);
    }
  };

  // src/crm-workspace/types.ts
  var DEFAULT_CONFIG = {
    theme: "dark",
    compact: false,
    showOverview: true,
    showProfile: true,
    showOpportunities: true,
    showActivities: true,
    showSms: true,
    showFiles: true,
    navigation: ["overview", "profile", "opportunities", "activities", "sms", "files"]
  };

  // src/crm-workspace/config.ts
  var KEY = "dyCrmWorkspaceConfig:v1";
  async function loadConfig() {
    try {
      const raw = localStorage.getItem(KEY);
      return { ...DEFAULT_CONFIG, ...raw ? JSON.parse(raw) : {} };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  async function saveConfig(config) {
    localStorage.setItem(KEY, JSON.stringify(config));
  }

  // src/crm-workspace/index.ts
  var HOST_ID = "dy-crm-workspace-host";
  var fa = (value) => String(value ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  var money = (v) => typeof v === "number" ? new Intl.NumberFormat("fa-IR").format(v) + " ریال" : "—";
  var date = (v) => v ? new Date(String(v)).toLocaleDateString("fa-IR") : "—";
  var CustomerWorkspace = class {
    host;
    root;
    contact = null;
    opportunities = [];
    activities = [];
    config = { ...DEFAULT_CONFIG };
    active = "overview";
    busy = false;
    constructor() {
      const existing = document.getElementById(HOST_ID);
      existing?.remove();
      this.host = document.createElement("div");
      this.host.id = HOST_ID;
      this.root = this.host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(this.host);
    }
    async start() {
      this.config = await loadConfig();
      this.render();
      try {
        const { entity, id } = getCurrentRecord();
        if (entity !== "contact") throw new Error("این پنل در حال حاضر فقط برای رکورد مخاطب طراحی شده است.");
        await this.refresh(id);
      } catch (e) {
        this.notify(e instanceof Error ? e.message : String(e), true);
      }
    }
    async refresh(id) {
      const recordId = id ?? getCurrentRecord().id;
      this.busy = true;
      this.render();
      try {
        const [contact, opps, acts] = await Promise.all([contactService.get(recordId), opportunityService.byContact(recordId), activityService.byContact(recordId)]);
        this.contact = contact;
        this.opportunities = opps.entities;
        this.activities = acts.entities;
      } finally {
        this.busy = false;
        this.render();
      }
    }
    notify(message, error = false) {
      const el = this.root.querySelector(".toast");
      if (!el) return;
      el.textContent = message;
      el.dataset.error = String(error);
      el.classList.add("show");
      window.setTimeout(() => el.classList.remove("show"), 3800);
    }
    nav(label, key, icon) {
      return `<button class="nav-item ${this.active === key ? "active" : ""}" data-nav="${key}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
    }
    render() {
      const c = this.contact;
      const name = c?.fullname || [c?.firstname, c?.lastname].filter(Boolean).join(" ") || "مخاطب";
      this.root.innerHTML = `<style>${CSS}</style><div class="launcher" id="launcher"><span class="launcher-mark">N</span><span>فضای مشتری</span></div>
      <section class="workspace ${this.config.theme === "light" ? "light" : ""} ${this.config.compact ? "compact" : ""}" id="workspace" dir="rtl">
        <header class="topbar"><div class="brand"><div class="brand-logo">N</div><div><b>نوین CRM</b><small>Customer Workspace</small></div></div>
          <div class="top-actions"><span class="connection"><i></i> اتصال به Dynamics</span><button class="icon-btn" data-action="refresh" title="بروزرسانی">↻</button><button class="icon-btn" data-action="admin" title="پنل مدیریت">⚙</button><button class="icon-btn close" data-action="close" title="بستن">×</button></div></header>
        <aside class="sidebar"><div class="side-caption">فضای کاری</div>${this.nav("نمای کلی", "overview", "◫")}${this.config.showProfile ? this.nav("اطلاعات مشتری", "profile", "◎") : ""}${this.config.showOpportunities ? this.nav("فرصت‌ها و فروش", "opportunities", "◇") : ""}${this.config.showActivities ? this.nav("فعالیت‌ها", "activities", "◷") : ""}${this.config.showSms ? this.nav("پیامک‌ها", "sms", "✉") : ""}${this.config.showFiles ? this.nav("اسناد و فایل‌ها", "files", "▤") : ""}<div class="side-bottom"><div class="mini-status"><i></i><span>جلسه CRM فعال است</span></div><small>DY CRM Toolkit · 1.15.0</small></div></aside>
        <main class="main"><div class="page-head"><div><div class="eyebrow">مدیریت ارتباط با مشتری / مخاطبان</div><h1>${fa(name)}</h1><p>نمای یکپارچه اطلاعات و تعاملات مشتری</p></div><div class="head-actions"><span class="status-pill">● ${c?.statecode === 1 ? "غیرفعال" : "فعال"}</span><button class="primary" data-action="edit">ویرایش اطلاعات</button></div></div>
          ${this.busy ? '<div class="loading"><span class="spinner"></span> در حال دریافت اطلاعات از Dynamics 365…</div>' : this.renderPage()}
        </main><div class="toast"></div>
      </section>`;
      this.bind();
    }
    renderPage() {
      const c = this.contact;
      if (!c) return '<div class="empty">مخاطبی برای نمایش بارگذاری نشده است.</div>';
      if (this.active === "admin") return this.renderAdmin();
      if (this.active === "profile") return this.renderProfile();
      if (this.active === "opportunities") return this.renderOpportunities();
      if (this.active === "activities") return this.renderActivities();
      if (this.active === "sms") return '<div class="empty-card"><b>ماژول پیامک</b><p>سوابق پیامک‌های مرتبط با مخاطب در این نسخه هنوز به موجودیت و ساختار پیامک CRM متصل نشده است. هیچ داده‌ای حدس زده نمی‌شود.</p></div>';
      if (this.active === "files") return '<div class="empty-card"><b>اسناد و فایل‌ها</b><p>برای اتصال این بخش باید نوع و ارتباط موجودیت فایل‌های مورد استفاده در سازمان مشخص شود.</p></div>';
      return this.renderOverview();
    }
    renderOverview() {
      const c = this.contact;
      const sum = this.opportunities.reduce((a, o) => a + (Number(o.actualvalue) || 0), 0);
      return `<section class="stats"><article class="stat"><span>فرصت‌های مرتبط</span><strong>${fa(this.opportunities.length)}</strong><small>رکوردهای مرتبط با مخاطب</small></article><article class="stat"><span>فروش تحقق‌یافته</span><strong>${money(sum)}</strong><small>جمع مبلغ واقعی فرصت‌های بازیابی‌شده</small></article><article class="stat"><span>فعالیت‌های ثبت‌شده</span><strong>${fa(this.activities.length)}</strong><small>فعالیت‌های قابل بازیابی</small></article><article class="stat accent"><span>وضعیت مشتری</span><strong>${c.statecode === 1 ? "غیرفعال" : "فعال"}</strong><small>وضعیت رکورد در Dynamics</small></article></section>
      <div class="content-grid"><section class="card profile-card"><div class="card-title"><div><h2>اطلاعات اصلی مشتری</h2><p>اطلاعات ثبت‌شده در پرونده مخاطب</p></div><button class="text-btn" data-nav="profile">مشاهده همه ←</button></div><div class="identity"><div class="avatar">${fa((c.firstname || c.fullname || "م").slice(0, 1))}</div><div><b>${fa(c.fullname || "")}</b><small>${fa(c.jobtitle || "عنوان شغلی ثبت نشده")}</small></div></div><div class="info-grid">${this.info("شماره همراه", c.mobilephone)}${this.info("ایمیل", c.emailaddress1)}${this.info("کد ملی", c.systan_nationalcode || c.systan_nationalidbase)}${this.info("تاریخ تولد", c.systan_birthdatefa || date(c.birthdate))}</div></section>
      <section class="card"><div class="card-title"><div><h2>آخرین فعالیت‌ها</h2><p>آخرین فعالیت‌های مرتبط با مشتری</p></div><button class="text-btn" data-nav="activities">مشاهده همه ←</button></div>${this.activities.slice(0, 5).map((a) => `<div class="timeline-row"><span class="timeline-dot"></span><div><b>${fa(a.subject || a.activitytypecode || "فعالیت")}</b><small>${fa(a.activitytypecode || "")} · ${date(a.createdon)}</small></div></div>`).join("") || '<div class="muted">فعالیتی برای نمایش پیدا نشد.</div>'}</section>
      <section class="card wide"><div class="card-title"><div><h2>فرصت‌های فروش</h2><p>فرصت‌های مرتبط با این مخاطب</p></div><button class="text-btn" data-nav="opportunities">مشاهده همه ←</button></div>${this.opportunities.slice(0, 5).map((o) => `<div class="table-row"><b>${fa(o.name)}</b><span>${money(o.actualvalue ?? o.estimatedvalue)}</span><span class="tag">${Number(o.statecode) === 1 ? "بسته" : "باز"}</span></div>`).join("") || '<div class="muted">فرصتی برای نمایش پیدا نشد.</div>'}</section></div>`;
    }
    info(label, value) {
      return `<div class="info-item"><small>${label}</small><b>${fa(value)}</b></div>`;
    }
    renderProfile() {
      const c = this.contact;
      const fields = [["نام", "firstname", c.firstname], ["نام خانوادگی", "lastname", c.lastname], ["شماره همراه", "mobilephone", c.mobilephone], ["تلفن ثابت", "telephone1", c.telephone1], ["ایمیل", "emailaddress1", c.emailaddress1], ["عنوان شغلی", "jobtitle", c.jobtitle], ["کد ملی", "systan_nationalcode", c.systan_nationalcode], ["شناسه هویتی", "systan_nationalidbase", c.systan_nationalidbase], ["نام پدر (فیلد ۱)", "systan_fathername", c.systan_fathername], ["نام پدر (فیلد ۲)", "systan_fathersname", c.systan_fathersname], ["تاریخ تولد شمسی", "systan_birthdatefa", c.systan_birthdatefa], ["تاریخ تولد CRM", "birthdate", c.birthdate]];
      return `<section class="card"><div class="card-title"><div><h2>اطلاعات شخصی</h2><p>مقادیر واقعی خوانده‌شده از Contact در Dynamics 365</p></div><button class="primary" data-action="edit">ویرایش</button></div><div class="field-grid">${fields.map(([label, key, value]) => `<label class="field"><span>${label}</span><input data-field="${key}" value="${fa(value)}" ${["systan_nationalcode", "systan_nationalidbase"].includes(key) ? 'dir="ltr"' : ""}></label>`).join("")}</div><div class="form-footer"><span class="muted">ذخیره تغییرات مستقیماً با Xrm.WebApi انجام می‌شود.</span><button class="primary" data-action="save-profile">ذخیره تغییرات</button></div></section>`;
    }
    renderOpportunities() {
      return `<section class="card"><div class="card-title"><div><h2>فرصت‌های فروش</h2><p>${fa(this.opportunities.length)} فرصت مرتبط</p></div></div><div class="table-head"><span>عنوان فرصت</span><span>مبلغ واقعی / تخمینی</span><span>وضعیت</span><span>تاریخ ایجاد</span></div>${this.opportunities.map((o) => `<div class="table-row"><b>${fa(o.name)}</b><span>${money(o.actualvalue ?? o.estimatedvalue)}</span><span class="tag">${Number(o.statecode) === 1 ? "بسته" : "باز"}</span><span>${date(o.createdon)}</span></div>`).join("") || '<div class="muted">فرصتی یافت نشد.</div>'}</section>`;
    }
    renderActivities() {
      return `<section class="card"><div class="card-title"><div><h2>فعالیت‌ها و تعاملات</h2><p>${fa(this.activities.length)} فعالیت بازیابی‌شده</p></div></div>${this.activities.map((a) => `<div class="activity"><div class="activity-icon">◷</div><div><b>${fa(a.subject || a.activitytypecode || "فعالیت")}</b><p>${fa(a.description || "بدون توضیحات")}</p><small>${fa(a.activitytypecode)} · ${date(a.createdon)}</small></div></div>`).join("") || '<div class="muted">فعالیتی برای نمایش یافت نشد.</div>'}</section>`;
    }
    renderAdmin() {
      return `<section class="card"><div class="card-title"><div><h2>مرکز مدیریت نوین CRM</h2><p>تنظیمات تجربه کاربری این افزونه در همین مرورگر ذخیره می‌شود.</p></div><span class="tag">Admin</span></div><div class="settings-grid"><label class="setting"><span>پوسته رابط</span><select id="cfg-theme"><option value="dark" ${this.config.theme === "dark" ? "selected" : ""}>تیره</option><option value="light" ${this.config.theme === "light" ? "selected" : ""}>روشن</option></select></label><label class="setting"><span>نمای فشرده</span><input type="checkbox" id="cfg-compact" ${this.config.compact ? "checked" : ""}></label>${["showOverview", "showProfile", "showOpportunities", "showActivities", "showSms", "showFiles"].map((key, i) => `<label class="setting"><span>${["نمای کلی", "اطلاعات مشتری", "فرصت‌ها", "فعالیت‌ها", "پیامک‌ها", "فایل‌ها"][i]}</span><input type="checkbox" id="cfg-${key}" ${this.config[key] ? "checked" : ""}></label>`).join("")}</div><div class="form-footer"><span class="muted">دسترسی‌های واقعی همچنان توسط امنیت Dynamics کنترل می‌شود.</span><button class="primary" data-action="save-config">ذخیره تنظیمات</button></div></section><section class="card"><h2>وضعیت اتصال و عیب‌یابی</h2><div class="diagnostic"><span class="ok-dot"></span><div><b>Xrm.WebApi در دسترس است</b><small>درخواست‌ها از نشست احراز هویت‌شده Dynamics ارسال می‌شوند.</small></div></div><div class="diagnostic"><span class="ok-dot"></span><div><b>رکورد جاری: Contact</b><small>${fa(this.contact?.contactid)}</small></div></div><div class="diagnostic"><span class="warn-dot"></span><div><b>ماژول پیامک و اسناد</b><small>برای اتصال کامل به ساختار سفارشی سازمان، نام موجودیت‌ها و روابط باید تأیید شود.</small></div></div></section>`;
    }
    bind() {
      this.root.querySelector("#launcher")?.addEventListener("click", () => this.root.querySelector("#workspace")?.classList.toggle("open"));
      this.root.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => {
        this.active = el.dataset.nav;
        this.render();
      }));
      this.root.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", () => void this.action(el.dataset.action || "")));
    }
    async action(action) {
      try {
        if (action === "close") {
          this.root.querySelector("#workspace")?.classList.remove("open");
          return;
        }
        if (action === "admin") {
          this.active = "admin";
          this.render();
          return;
        }
        if (action === "refresh") {
          await this.refresh();
          this.notify("اطلاعات از Dynamics بروزرسانی شد.");
          return;
        }
        if (action === "edit") {
          this.active = "profile";
          this.render();
          return;
        }
        if (action === "save-profile") {
          const data = {};
          this.root.querySelectorAll("[data-field]").forEach((input) => {
            data[input.dataset.field || ""] = input.value.trim() || null;
          });
          await contactService.update(this.contact.contactid, data);
          await this.refresh();
          this.active = "profile";
          this.render();
          this.notify("اطلاعات مخاطب با موفقیت ذخیره شد.");
          return;
        }
        if (action === "save-config") {
          const get = (id) => this.root.querySelector(`#cfg-${id}`);
          this.config = { ...this.config, theme: this.root.querySelector("#cfg-theme")?.value === "light" ? "light" : "dark", compact: !!get("compact")?.checked, showOverview: !!get("showOverview")?.checked, showProfile: !!get("showProfile")?.checked, showOpportunities: !!get("showOpportunities")?.checked, showActivities: !!get("showActivities")?.checked, showSms: !!get("showSms")?.checked, showFiles: !!get("showFiles")?.checked };
          await saveConfig(this.config);
          this.notify("تنظیمات ذخیره شد.");
          this.active = "overview";
          this.render();
          return;
        }
      } catch (e) {
        this.notify(e instanceof Error ? e.message : String(e), true);
      }
    }
  };
  function hasDynamicsFormContext(win) {
    try {
      return !!win.Xrm?.Page?.data?.entity?.getEntityName?.();
    } catch {
      return false;
    }
  }
  function isHighestDynamicsFormFrame() {
    if (!hasDynamicsFormContext(window)) return false;
    let parent = window.parent;
    while (parent !== window) {
      try {
        if (hasDynamicsFormContext(parent)) return false;
        if (parent === parent.parent) break;
        parent = parent.parent;
      } catch {
        break;
      }
    }
    return true;
  }
  if (!window.__dyCustomerWorkspaceLoaded && isHighestDynamicsFormFrame()) {
    window.__dyCustomerWorkspaceLoaded = true;
    const boot = () => {
      if (!window.Xrm?.WebApi || !window.Xrm?.Page?.data?.entity) {
        console.error("[DY CRM Workspace] Authenticated Dynamics Xrm.WebApi context is not available in this frame.");
        return;
      }
      const app = new CustomerWorkspace();
      void app.start().catch((error) => console.error("[DY CRM Workspace] Startup failed:", error));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
  var CSS = `

:host{all:initial;font-family:"DY Vazir",'Segoe UI',sans-serif;color:#eaf1f8}*{box-sizing:border-box}.launcher{position:fixed;z-index:2147483000;right:18px;bottom:22px;display:flex;align-items:center;gap:9px;padding:10px 16px 10px 12px;border:1px solid #2b5572;border-radius:16px;background:linear-gradient(135deg,#10283e,#0c1b2b);color:#eafaff;box-shadow:0 12px 35px #06111f66;cursor:pointer;font:600 13px "DY Vazir"}.launcher-mark,.brand-logo{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,#24d2c2,#1688bb);color:#062331;font-weight:900}.workspace{--bg:#0b1725;--panel:#122338;--panel2:#172d43;--line:#294158;--text:#eaf2f8;--muted:#91a8bb;--cyan:#42d6ca;--blue:#4ba9e8;position:fixed;z-index:2147482999;inset:0;background:var(--bg);color:var(--text);display:none;grid-template-columns:248px 1fr;grid-template-rows:66px 1fr;direction:rtl;font:14px/1.8 "DY Vazir",'Segoe UI',sans-serif}.workspace.open{display:grid}.workspace.light{--bg:#f1f5f9;--panel:#fff;--panel2:#f7fafc;--line:#dce5ed;--text:#172b3e;--muted:#62788c;--cyan:#078e89;--blue:#147dbb}.topbar{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:0 24px;border-bottom:1px solid var(--line);background:var(--panel)}.brand{display:flex;align-items:center;gap:11px}.brand b{display:block;font-size:15px}.brand small{display:block;color:var(--muted);font-size:10px;letter-spacing:.5px}.brand-logo{width:36px;height:36px;border-radius:12px}.top-actions{display:flex;align-items:center;gap:10px}.connection{font-size:11px;color:var(--muted);padding:6px 10px;border:1px solid var(--line);border-radius:20px}.connection i,.mini-status i,.ok-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#32c995;margin-left:6px}.icon-btn{border:1px solid var(--line);background:var(--panel2);color:var(--text);width:34px;height:34px;border-radius:10px;font-size:18px;cursor:pointer}.icon-btn:hover{border-color:var(--cyan);color:var(--cyan)}.sidebar{grid-row:2;background:var(--panel);border-left:1px solid var(--line);padding:22px 14px;display:flex;flex-direction:column;gap:5px}.side-caption{color:var(--muted);font-size:10px;padding:0 12px 10px}.nav-item{border:0;background:transparent;color:var(--muted);padding:10px 12px;border-radius:10px;text-align:right;font:500 12px "DY Vazir";cursor:pointer;display:flex;gap:12px;align-items:center}.nav-item:hover,.nav-item.active{background:color-mix(in srgb,var(--cyan) 12%,transparent);color:var(--cyan)}.nav-icon{font-size:18px;width:20px;text-align:center}.side-bottom{margin-top:auto;border-top:1px solid var(--line);padding:15px 8px 0;color:var(--muted);font-size:10px}.side-bottom small{display:block;margin-top:9px}.main{grid-row:2;overflow:auto;padding:28px clamp(18px,3vw,46px);background:var(--bg)}.page-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}.eyebrow{color:var(--cyan);font-size:10px}.page-head h1{font-size:25px;margin:3px 0 0;font-weight:800}.page-head p,.card-title p{margin:0;color:var(--muted);font-size:11px}.head-actions{display:flex;align-items:center;gap:12px}.status-pill,.tag{font-size:10px;border-radius:20px;padding:5px 10px;background:#17483f;color:#72e3c3}.primary{border:0;border-radius:10px;padding:9px 17px;background:linear-gradient(135deg,#26cabb,#238cba);color:#06232d;font:700 11px "DY Vazir";cursor:pointer}.primary:hover{filter:brightness(1.1)}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:16px}.stat,.card{background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:17px;box-shadow:0 5px 18px #0000000b}.stat{position:relative;overflow:hidden}.stat:after{content:'';position:absolute;left:-20px;bottom:-35px;width:90px;height:90px;border-radius:50%;background:color-mix(in srgb,var(--blue) 10%,transparent)}.stat span,.stat small{display:block;color:var(--muted);font-size:10px}.stat strong{display:block;font-size:23px;margin:7px 0 2px}.stat.accent strong{color:var(--cyan)}.content-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.card{min-width:0}.card.wide{grid-column:1/-1}.card-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px}.card-title h2,.card h2{font-size:14px;margin:0 0 2px}.text-btn{border:0;background:none;color:var(--cyan);font:11px "DY Vazir";cursor:pointer}.identity{display:flex;align-items:center;gap:12px;padding:10px 0 17px;border-bottom:1px solid var(--line)}.avatar{width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,#1c9caa,#275b89);display:grid;place-items:center;font-size:20px}.identity b,.identity small{display:block}.identity small{color:var(--muted);font-size:10px}.info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:15px;padding-top:16px}.info-item small,.info-item b{display:block}.info-item small{font-size:10px;color:var(--muted)}.info-item b{font-size:12px;margin-top:2px;overflow-wrap:anywhere}.timeline-row,.activity{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.timeline-dot{width:8px;height:8px;border-radius:50%;background:var(--cyan);margin:8px 3px 0}.timeline-row b,.timeline-row small{display:block}.timeline-row b{font-size:11px}.timeline-row small{font-size:9px;color:var(--muted)}.table-head,.table-row{display:grid;grid-template-columns:2fr 1fr .7fr 1fr;gap:10px;align-items:center;padding:11px 8px;border-bottom:1px solid var(--line);font-size:11px}.table-head{color:var(--muted);font-size:10px}.table-row b{font-weight:600}.muted{color:var(--muted);font-size:11px;padding:15px 0}.field-grid,.settings-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.field span,.setting span{display:block;color:var(--muted);font-size:10px;margin-bottom:5px}.field input,.setting select{width:100%;height:40px;border:1px solid var(--line);border-radius:9px;background:var(--panel2);color:var(--text);padding:0 10px;font:11px "DY Vazir"}.form-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);padding-top:16px;margin-top:20px}.setting{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2)}.setting span{margin:0;color:var(--text)}.diagnostic{display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}.diagnostic b,.diagnostic small{display:block}.diagnostic b{font-size:11px}.diagnostic small{font-size:10px;color:var(--muted)}.warn-dot{width:7px;height:7px;border-radius:50%;background:#e6ad51}.activity-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:var(--panel2);color:var(--cyan)}.activity b{font-size:12px}.activity p{margin:3px 0;font-size:10px;color:var(--muted)}.activity small{font-size:9px;color:var(--muted)}.empty-card{background:var(--panel);border:1px dashed var(--line);border-radius:14px;padding:30px}.empty-card p{color:var(--muted);font-size:12px}.loading{padding:70px;text-align:center;color:var(--muted)}.spinner{display:inline-block;width:18px;height:18px;border:2px solid var(--line);border-top-color:var(--cyan);border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-left:8px}@keyframes spin{to{transform:rotate(360deg)}}.toast{position:fixed;bottom:20px;left:24px;padding:10px 16px;background:#163e3c;border:1px solid #277b70;border-radius:10px;color:#c8fff1;opacity:0;transform:translateY(8px);transition:.2s;pointer-events:none;font-size:11px}.toast.show{opacity:1;transform:none}.toast[data-error=true]{background:#4a252b;border-color:#9c4652;color:#ffe0e4}.compact .card,.compact .stat{padding:12px}.compact .nav-item{padding:7px 10px}@media(max-width:900px){.workspace{grid-template-columns:190px 1fr}.stats{grid-template-columns:repeat(2,1fr)}.content-grid{grid-template-columns:1fr}.field-grid,.settings-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.workspace{grid-template-columns:1fr;grid-template-rows:60px 1fr}.sidebar{display:none}.main{grid-column:1;padding:16px}.page-head{align-items:flex-start;gap:12px;flex-direction:column}.stats{grid-template-columns:repeat(2,1fr)}.field-grid,.settings-grid{grid-template-columns:1fr}.table-head,.table-row{grid-template-columns:1.5fr 1fr}.table-head span:nth-child(n+3),.table-row span:nth-child(n+3){display:none}.connection{display:none}}
`;
})();
