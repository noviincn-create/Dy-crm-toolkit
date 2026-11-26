"use strict";
(() => {
  // src/shared/text.ts
  var FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  var toLatinDigits = (s) => String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15));
  var toFaDigits = (s) => String(s ?? "").replace(/[0-9]/g, (d) => FA_DIGITS.charAt(Number(d)));
  var faNum = (n) => {
    try {
      return Number(n).toLocaleString("fa-IR");
    } catch {
      return String(n);
    }
  };
  var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);
  var errorMessage = (e) => e instanceof Error ? e.message : String(e);

  // src/portal/client.ts
  var PortalError = class extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
      this.name = "PortalError";
    }
  };
  async function call(op, payload = {}) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) throw new PortalError("ارتباط با افزونه برقرار نیست؛ افزونه را Reload کنید.");
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "portal", req: { op, ...payload } });
    } catch (e) {
      throw new PortalError(errorMessage(e).includes("Extension context invalidated") ? "افزونه به‌روزرسانی شده است؛ این صفحه را دوباره باز کنید." : errorMessage(e));
    }
    if (!res || typeof res !== "object") throw new PortalError("پاسخی از افزونه دریافت نشد.");
    if ("error" in res) throw new PortalError(res.error);
    if (!res.ok) throw new PortalError(res.message, res.code);
    return res.data;
  }

  // src/portal/auth.ts
  function mountAuth(root2, status, onDone, notice = "") {
    const s = { tab: "login", method: "mobile", stage: "form", flowId: "", masked: "", person: "", resendAt: 0, busy: false, error: "" };
    let timer = 0;
    const reset = (patch = {}) => {
      Object.assign(s, { stage: "form", flowId: "", masked: "", person: "", error: "", busy: false }, patch);
      draw();
    };
    const apply = (step) => {
      s.busy = false;
      s.error = "";
      switch (step.step) {
        case "otp":
          s.stage = "otp";
          s.flowId = step.flowId;
          s.masked = step.maskedMobile;
          s.resendAt = Date.now() + step.resendIn * 1e3;
          break;
        case "identity":
          s.stage = "identity";
          s.flowId = step.flowId;
          break;
        case "mobile":
          s.stage = "mobile";
          s.flowId = step.flowId;
          s.person = `${step.person.firstName} ${step.person.lastName}`.trim();
          break;
        case "notFound":
          s.stage = "notFound";
          break;
        case "exists":
          s.stage = "exists";
          break;
        case "done":
          clearInterval(timer);
          onDone(step.token, step.created);
          return;
      }
      draw();
    };
    const run = async (fn) => {
      if (s.busy) return;
      s.busy = true;
      s.error = "";
      draw(false);
      try {
        apply(await fn());
      } catch (e) {
        s.busy = false;
        s.error = e instanceof Error ? e.message : String(e);
        draw();
      }
    };
    const val = (id) => toLatinDigits((root2.querySelector("#" + id)?.value ?? "").trim());
    const submit = () => {
      if (s.stage === "otp") {
        void run(() => call("otpVerify", { flowId: s.flowId, code: val("f-code") }));
        return;
      }
      if (s.tab === "login") {
        void run(() => call("loginStart", { method: s.method, value: val("f-value") }));
      } else if (s.stage === "form" && s.method === "mobile") {
        void run(() => call("signupMobile", { mobile: val("f-value") }));
      } else if (s.stage === "form") {
        void run(() => call("signupKyc", { nationalCode: val("f-national"), birthDate: val("f-birth") }));
      } else if (s.stage === "identity") {
        void run(() => call("signupIdentity", { flowId: s.flowId, nationalCode: val("f-national"), birthDate: val("f-birth") }));
      } else if (s.stage === "mobile") {
        void run(() => call("signupMobileSend", { flowId: s.flowId, mobile: val("f-value") }));
      }
    };
    const field = (id, label, ph, extra = "") => `<label class="f"><span>${label}</span><input id="${id}" type="text" inputmode="numeric" autocomplete="off" dir="ltr" placeholder="${ph}" ${extra}></label>`;
    const form = () => {
      if (s.stage === "otp") {
        return {
          title: "کد تایید",
          cta: "تایید و ادامه",
          hint: `کد ۶ رقمی به شمارهٔ <b dir="ltr">${esc(s.masked)}</b> پیامک شد.`,
          body: `${field("f-code", "کد تایید", "------", 'maxlength="8" autofocus class="otp"')}<div class="row"><button type="button" class="lnk" data-a="back">‹ تغییر ورودی</button><button type="button" class="lnk" data-a="resend" id="resend" disabled></button></div>`
        };
      }
      const mobileField = field("f-value", "شمارهٔ موبایل", "09123456789", "autofocus");
      const identity = `${field("f-national", "کد ملی", "۱۰ رقم", 'maxlength="10" autofocus')}${field("f-birth", "تاریخ تولد (شمسی)", "1377/06/30", 'maxlength="10"')}`;
      if (s.tab === "login") {
        return s.method === "mobile" ? { title: "ورود با موبایل", hint: "کد تایید به همین شماره پیامک می‌شود.", body: mobileField, cta: "دریافت کد" } : { title: "ورود با کد ملی", hint: "کد تایید به موبایلِ ثبت‌شده در پروندهٔ شما پیامک می‌شود.", body: field("f-value", "کد ملی", "۱۰ رقم", 'maxlength="10" autofocus'), cta: "دریافت کد" };
      }
      if (s.stage === "identity") return { title: "تایید هویت", hint: "موبایل شما تایید شد. برای ساخت پرونده، کد ملی و تاریخ تولد را وارد کنید.", body: identity, cta: "تایید هویت و ساخت پرونده" };
      if (s.stage === "mobile") return { title: `سلام ${esc(s.person)}`, hint: "هویت شما تایید شد. شمارهٔ موبایل خود را وارد کنید تا کد تایید بفرستیم.", body: mobileField, cta: "دریافت کد" };
      return s.method === "mobile" ? { title: "ثبت‌نام با موبایل", hint: "ابتدا موبایل تایید می‌شود، سپس هویت شما با کد ملی بررسی می‌شود.", body: mobileField, cta: "دریافت کد" } : { title: "ثبت‌نام با کد ملی", hint: "ابتدا هویت شما بررسی می‌شود، سپس موبایل تایید می‌شود.", body: identity, cta: "بررسی هویت" };
    };
    const banner = () => {
      const m = status.missing.map((x) => x === "sms" ? "کلید IPPanel" : "توکن زحل");
      return !status.enabled ? `<div class="msg warn">پورتال از تنظیمات افزونه غیرفعال شده است.</div>` : m.length ? `<div class="msg warn">${m.join(" و ")} در تنظیمات افزونه وارد نشده است.</div>` : "";
    };
    function draw(rebuild = true) {
      clearInterval(timer);
      if (!rebuild) {
        root2.querySelectorAll("button.pri").forEach((b) => {
          b.disabled = true;
        });
        return;
      }
      const inFlow = s.stage !== "form";
      let main;
      if (s.stage === "exists" || s.stage === "notFound") {
        const exists = s.stage === "exists";
        main = `<div class="center"><div class="ico ${exists ? "info" : "warn"}">${exists ? "✓" : "?"}</div>
        <h2>${exists ? "شما قبلاً ثبت‌نام کرده‌اید" : "پرونده‌ای پیدا نشد"}</h2>
        <p class="mu">${exists ? "برای این مشخصات پروندهٔ فعال وجود دارد. با همان وارد شوید." : status.allowSignup ? "با این مشخصات مشتری ثبت‌نشده‌ای نداریم. می‌توانید ثبت‌نام کنید." : "ثبت‌نام آنلاین فعال نیست؛ با پذیرش تماس بگیرید."}</p>
        <button class="btn pri" data-a="${exists || !status.allowSignup ? "tab-login" : "tab-signup"}">${exists || !status.allowSignup ? "رفتن به ورود" : "ثبت‌نام"}</button></div>`;
      } else {
        const f = form();
        const tabs = inFlow ? "" : `<div class="seg" role="tablist"><button data-a="tab-login" aria-selected="${s.tab === "login"}">ورود</button>${status.allowSignup ? `<button data-a="tab-signup" aria-selected="${s.tab === "signup"}">ثبت‌نام</button>` : ""}</div>
        <div class="seg sm"><button data-a="m-mobile" aria-selected="${s.method === "mobile"}">با موبایل</button><button data-a="m-national" aria-selected="${s.method === "national"}">با کد ملی</button></div>`;
        main = `${tabs}<h2>${f.title}</h2><p class="mu">${f.hint}</p>
        <form id="auth-form" novalidate>${f.body}${s.error ? `<div class="msg err" role="alert">${esc(s.error)}</div>` : ""}
        <button class="btn pri wide" type="submit"${s.busy || !status.enabled ? " disabled" : ""}>${s.busy ? "لطفاً صبر کنید…" : f.cta}</button></form>
        ${inFlow && s.stage !== "otp" ? `<div class="row"><button type="button" class="lnk" data-a="cancel">‹ انصراف و شروع دوباره</button></div>` : ""}`;
      }
      root2.innerHTML = `<div class="auth"><div class="auth-side"><div class="logo">DY</div><h1>پورتال مشتریان</h1>
      <p>پروفایل، فرصت‌های تجاری، تیکت‌ها و اسناد شما در یک‌جا.</p>
      <ul><li>ورود امن با کد پیامکی</li><li>احراز هویت با کد ملی</li><li>پیگیری لحظه‌ای درخواست‌ها</li></ul></div>
      <div class="auth-main">${notice ? `<div class="msg info">${esc(notice)}</div>` : ""}${banner()}${main}</div></div>`;
      bind();
    }
    function bind() {
      root2.querySelector("#auth-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        submit();
      });
      root2.querySelectorAll("[data-a]").forEach((el) => el.addEventListener("click", () => {
        const a = el.dataset.a ?? "";
        if (a === "tab-login" || a === "tab-signup") reset({ tab: a === "tab-login" ? "login" : "signup" });
        else if (a === "m-mobile" || a === "m-national") reset({ method: a === "m-mobile" ? "mobile" : "national" });
        else if (a === "cancel") reset({ stage: "form" });
        else if (a === "back") {
          s.stage = s.tab === "signup" && s.method === "national" ? "mobile" : "form";
          s.error = "";
          draw();
        } else if (a === "resend") void run(async () => {
          const r = await call("otpResend", { flowId: s.flowId });
          return r;
        });
      }));
      const btn = root2.querySelector("#resend");
      if (btn) {
        const tick = () => {
          const left = Math.ceil((s.resendAt - Date.now()) / 1e3);
          btn.disabled = left > 0;
          btn.textContent = left > 0 ? `ارسال دوباره تا ${left} ثانیه دیگر` : "ارسال دوباره کد";
        };
        tick();
        timer = window.setInterval(tick, 1e3);
      }
      root2.querySelector("input[autofocus]")?.focus();
    }
    draw();
  }

  // src/shared/jalali.ts
  function formatJalali(d) {
    try {
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  // src/portal/format.ts
  var date = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : formatJalali(d);
  };
  var dateTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${formatJalali(d)} ${toFaDigits(d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }))}`;
  };
  var unit = "";
  var setUnit = (u) => {
    unit = u;
  };
  var money = (n) => n == null ? "—" : faNum(Math.round(n)) + (unit ? " " + unit : "");
  var badge = (r) => `<span class="bd ${r.tone}">${esc(r.status || r.state || "—")}</span>`;
  function completeness(p) {
    const checks = [
      ["تایید هویت (کد ملی و تاریخ تولد)", p.verified],
      ["ایمیل", !!p.email],
      ["تلفن ثابت", !!p.phone],
      ["نشانی", !!p.address],
      ["شهر", !!p.city],
      ["کد پستی", !!p.postal],
      ["شغل", !!p.jobTitle]
    ];
    const done = checks.filter(([, ok]) => ok).length;
    return { pct: Math.round(done / checks.length * 100), missing: checks.filter(([, ok]) => !ok).map(([n]) => n) };
  }

  // src/portal/views.ts
  var EMPTY = (t) => `<div class="empty"><div class="ico">∅</div><p>${esc(t)}</p></div>`;
  var stat = (label, value, sub, tone, go) => `<button class="stat ${tone}" data-go="${go}"><span class="k">${label}</span><b>${value}</b><small>${sub}</small></button>`;
  var rowItem = (r, go) => `<button class="it" data-go="${go}/${esc(r.id)}"><span class="t"><b>${esc(r.title || "بدون عنوان")}</b><small>${r.number ? "#" + esc(toFaDigits(r.number)) + " · " : ""}${date(r.modifiedOn ?? r.createdOn)}</small></span>${r.amount != null ? `<span class="amt">${money(r.amount)}</span>` : ""}${badge(r)}</button>`;
  function dashboardView(d) {
    const { stats: s, profile: p } = d;
    const c = completeness(p);
    const tips = [];
    if (s.openTickets) tips.push(`${faNum(s.openTickets)} تیکت باز دارید؛ پاسخ‌ها را در بخش تیکت‌ها ببینید.`);
    if (s.openOpps) tips.push(`${faNum(s.openOpps)} درخواست در حال پیگیری است.`);
    if (!p.verified) tips.push("هویت شما هنوز با کد ملی و تاریخ تولد تایید نشده است.");
    if (c.missing.length && p.verified) tips.push(`برای تکمیل پروفایل: ${c.missing.slice(0, 3).join("، ")}.`);
    if (!tips.length) tips.push("همه‌چیز مرتب است. برای درخواست جدید از دکمهٔ «درخواست جدید» استفاده کنید.");
    return `
  <section class="hero"><div><h1>سلام ${esc(p.firstName || p.fullName || "مشتری گرامی")} 👋</h1><p class="mu">خلاصهٔ وضعیت حساب شما</p></div>
    <div class="acts"><button class="btn" data-act="new-ticket">+ تیکت جدید</button><button class="btn pri" data-act="new-request">+ درخواست جدید</button></div></section>
  ${d.errors.length ? `<div class="msg warn">بخش‌های «${esc(d.errors.join("، "))}» اکنون در دسترس نیست؛ بقیهٔ اطلاعات نمایش داده می‌شود.</div>` : ""}
  <section class="stats">
    ${stat("فرصت‌های باز", faNum(s.openOpps), s.openOppsValue ? "ارزش: " + money(s.openOppsValue) : "در حال پیگیری", "pr", "opportunities")}
    ${stat("فرصت‌های موفق", faNum(s.wonOpps), s.wonValue ? "مجموع: " + money(s.wonValue) : "—", "ok", "opportunities")}
    ${stat("تیکت‌های باز", faNum(s.openTickets), `${faNum(s.resolvedTickets)} حل‌شده`, s.openTickets ? "wa" : "mu", "tickets")}
    ${stat("اسناد مالی", faNum(s.quotes + s.orders + s.invoices), s.invoicesTotal ? "فاکتورها: " + money(s.invoicesTotal) : `${faNum(s.invoices)} فاکتور`, "in", "documents")}
  </section>
  <section class="grid2">
    <div class="card"><div class="ch"><h3>فرصت‌های اخیر</h3><button class="lnk" data-go="opportunities">همه ›</button></div>${d.recentOpps.length ? d.recentOpps.map((r) => rowItem(r, "opportunities")).join("") : EMPTY("هنوز فرصتی ثبت نشده است.")}</div>
    <div class="card"><div class="ch"><h3>تیکت‌های اخیر</h3><button class="lnk" data-go="tickets">همه ›</button></div>${d.recentTickets.length ? d.recentTickets.map((r) => rowItem(r, "tickets")).join("") : EMPTY("تیکتی ثبت نشده است.")}</div>
  </section>
  <section class="grid2">
    <div class="card smart"><div class="ch"><h3>دستیار هوشمند</h3></div>
      <div class="ring" style="--p:${c.pct}"><b>${faNum(c.pct)}٪</b><small>تکمیل پروفایل</small></div>
      <ul class="tips">${tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><button class="btn" data-go="profile">تکمیل پروفایل</button></div>
    <div class="card"><div class="ch"><h3>آخرین فعالیت‌ها</h3><button class="lnk" data-go="activity">همه ›</button></div>
      ${d.activity.length ? `<ol class="tl">${d.activity.slice(0, 6).map(timelineItem).join("")}</ol>` : EMPTY("فعالیتی ثبت نشده است.")}</div>
  </section>`;
  }
  var timelineItem = (r) => `<li><i class="${r.tone}"></i><div><b>${esc(r.title || r.kind || "فعالیت")}</b><small>${esc(r.kind || "")} · ${dateTime(r.createdOn)}</small></div>${badge(r)}</li>`;
  function listView(kind, rows, filter2, q, error) {
    const shown = rows.filter((r) => (filter2 === "all" || r.tone === filter2) && (!q || (r.title + " " + r.number).toLowerCase().includes(q.toLowerCase())));
    const isOpp = kind === "opportunities";
    const chips = [["all", "همه"], ["open", isOpp ? "باز" : "باز"], ["won", isOpp ? "موفق" : "حل‌شده"], ["lost", isOpp ? "ناموفق" : "لغوشده"]];
    return `<section class="hero"><div><h1>${isOpp ? "فرصت‌های تجاری" : "تیکت‌ها"}</h1><p class="mu">${faNum(rows.length)} مورد</p></div>
    <div class="acts"><button class="btn pri" data-act="${isOpp ? "new-request" : "new-ticket"}">+ ${isOpp ? "درخواست جدید" : "تیکت جدید"}</button></div></section>
    <div class="bar2"><input id="q" type="search" placeholder="جستجو در عنوان یا شماره…" value="${esc(q)}"><div class="chips">${chips.map(([k, l]) => `<button data-filter="${k}" aria-pressed="${filter2 === k}">${l}</button>`).join("")}</div></div>
    ${error ? `<div class="msg warn">${esc(error)}</div>` : ""}
    <div class="card list">${shown.length ? shown.map((r) => rowItem(r, kind)).join("") : EMPTY(rows.length ? "موردی با این فیلتر پیدا نشد." : "موردی ثبت نشده است.")}</div>`;
  }
  function documentsView(tab, rows, error) {
    const tabs = [["quotes", "پیش‌فاکتورها"], ["orders", "سفارش‌ها"], ["invoices", "فاکتورها"]];
    return `<section class="hero"><div><h1>اسناد مالی</h1><p class="mu">پیش‌فاکتور، سفارش و فاکتور</p></div></section>
    <div class="seg"><div class="seg-in">${tabs.map(([k, l]) => `<button data-doc="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div></div>
    ${error ? `<div class="msg warn">${esc(error)}</div>` : ""}
    <div class="card list">${rows.length ? rows.map((r) => `<div class="it static"><span class="t"><b>${esc(r.title || "بدون عنوان")}</b><small>${r.number ? "#" + esc(toFaDigits(r.number)) + " · " : ""}${date(r.createdOn)}${r.dueOn ? " · سررسید " + date(r.dueOn) : ""}</small></span><span class="amt">${money(r.amount)}</span>${badge(r)}</div>`).join("") : EMPTY("سندی ثبت نشده است.")}</div>`;
  }
  function activityView(rows, error) {
    return `<section class="hero"><div><h1>فعالیت‌ها</h1><p class="mu">تماس‌ها، پیگیری‌ها و پیام‌های مرتبط با پروندهٔ شما</p></div></section>
    ${error ? `<div class="msg warn">${esc(error)}</div>` : ""}<div class="card">${rows.length ? `<ol class="tl">${rows.map(timelineItem).join("")}</ol>` : EMPTY("فعالیتی ثبت نشده است.")}</div>`;
  }
  function detailView(kind, d) {
    const isT = kind === "ticket";
    const back = isT ? "tickets" : "opportunities";
    const lines = d.lines.length ? `<div class="card"><div class="ch"><h3>اقلام</h3></div><div class="tbl"><table><thead><tr><th>کالا / خدمت</th><th>تعداد</th><th>قیمت واحد</th><th>مبلغ</th></tr></thead><tbody>${d.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.qty == null ? "—" : faNum(l.qty)}</td><td>${money(l.price)}</td><td>${money(l.total)}</td></tr>`).join("")}</tbody></table></div></div>` : "";
    const notes = `<div class="card"><div class="ch"><h3>${isT ? "گفتگو" : "یادداشت‌ها"}</h3></div>
    ${d.notes.length ? d.notes.map((n) => `<div class="note ${n.mine ? "me" : ""}"><div class="nh"><b>${esc(n.by)}</b><small>${dateTime(n.createdOn)}</small></div>${n.subject ? `<div class="ns">${esc(n.subject)}</div>` : ""}<p>${esc(n.text).replace(/\n/g, "<br>")}</p></div>`).join("") : EMPTY("هنوز پیامی ثبت نشده است.")}
    ${isT && d.row.tone === "open" ? `<form id="reply" class="reply"><textarea id="reply-text" rows="3" maxlength="4000" placeholder="پیام یا پاسخ خود را بنویسید…"></textarea><div class="err-slot"></div><button class="btn pri" type="submit">ارسال پیام</button></form>` : ""}</div>`;
    return `<button class="lnk back" data-go="${back}">‹ بازگشت</button>
    <section class="hero"><div><h1>${esc(d.row.title || "بدون عنوان")}</h1><p class="mu">${d.row.number ? "#" + esc(toFaDigits(d.row.number)) : ""}</p></div>${badge(d.row)}</section>
    <div class="grid2 top"><div class="card"><div class="ch"><h3>مشخصات</h3></div><dl class="kv">${d.fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(/^\d{4}-\d{2}-\d{2}T/.test(v) ? dateTime(v) : v)}</dd></div>`).join("")}</dl>
    ${d.description ? `<div class="desc"><h4>توضیحات</h4><p>${esc(d.description).replace(/\n/g, "<br>")}</p></div>` : ""}</div>${notes}</div>${lines}`;
  }
  var pf = (id, label, v, extra = "") => `<label class="f"><span>${label}</span><input id="${id}" type="text" value="${esc(v)}" ${extra}></label>`;
  var ro = (label, v) => `<div class="rof"><span>${label}</span><b>${esc(v) || "—"}</b></div>`;
  function profileView(p) {
    const c = completeness(p);
    return `<section class="hero"><div><h1>پروفایل من</h1><p class="mu">${p.verified ? '<span class="bd won">هویت تایید شده ✓</span>' : '<span class="bd open">هویت تایید نشده</span>'}</p></div></section>
  <div class="grid2 top">
    <div class="card"><div class="ch"><h3>اطلاعات هویتی</h3></div><p class="mu sm">این اطلاعات از طریق استعلام رسمی تایید شده و قابل ویرایش نیست.</p>
      ${ro("نام و نام خانوادگی", p.fullName)}${ro("نام پدر", p.fatherName)}${ro("کد ملی", p.nationalMasked)}${ro("تاریخ تولد", toFaDigits(p.birthDate))}${ro("شرکت", p.company)}${ro("عضویت از", date(p.createdOn))}
      <div class="ring sm" style="--p:${c.pct}"><b>${faNum(c.pct)}٪</b><small>تکمیل پروفایل</small></div></div>
    <div class="card"><div class="ch"><h3>اطلاعات تماس</h3></div>
      <form id="profile-form" novalidate>
        ${pf("p-email", "ایمیل", p.email, 'dir="ltr"')}${pf("p-phone", "تلفن ثابت", p.phone, 'dir="ltr"')}${pf("p-job", "شغل", p.jobTitle)}${pf("p-city", "شهر", p.city)}${pf("p-postal", "کد پستی", p.postal, 'dir="ltr" maxlength="10"')}${pf("p-address", "نشانی", p.address)}
        <div class="err-slot"></div><button class="btn pri" type="submit">ذخیرهٔ تغییرات</button></form></div>
    <div class="card"><div class="ch"><h3>شمارهٔ موبایل</h3></div>
      <div id="mob"><div class="rof"><span>موبایل فعلی</span><b dir="ltr">${esc(p.mobile) || "—"}</b></div>
      <form id="mobile-form" novalidate><label class="f"><span>شمارهٔ جدید</span><input id="m-new" type="text" inputmode="numeric" dir="ltr" placeholder="09123456789"></label>
        <div class="err-slot"></div><button class="btn" type="submit">ارسال کد تایید</button></form></div></div>
  </div>`;
  }

  // src/portal/app.ts
  var TOKEN_KEY = "dyPortalToken";
  var root = document.getElementById("app");
  var token = "";
  var me = null;
  var filter = "all";
  var query = "";
  var docTab = "quotes";
  var lists = /* @__PURE__ */ new Map();
  var navSeq = 0;
  var lastPage = "";
  var NAV = [
    ["dashboard", "داشبورد", "▦"],
    ["opportunities", "فرصت‌های تجاری", "◈"],
    ["tickets", "تیکت‌ها", "✉"],
    ["documents", "اسناد مالی", "▤"],
    ["activity", "فعالیت‌ها", "◷"],
    ["profile", "پروفایل", "☺"]
  ];
  function showDiagnosis(d, next) {
    const rows = d.checks.map((c) => `<details class="dg ${c.ok ? "ok" : "bad"}"${c.ok ? "" : " open"}><summary>${c.ok ? "✓" : "✗"} ${esc(c.name)}</summary><pre dir="ltr">${esc(c.detail)}</pre></details>`).join("");
    root.innerHTML = `<div class="boot"><div class="msg err" role="alert"><b>تست ارتباط با CRM ناموفق بود</b><br>خروجی دقیق هر مرحله در ادامه آمده است.</div>${rows}
    <div class="row"><button class="btn pri" id="dg-retry">تلاش دوباره</button> <button class="lnk" id="dg-skip">ادامه بدون رفع مشکل</button> <button class="lnk" id="dg-copy">کپی گزارش</button></div></div>`;
    document.getElementById("dg-retry")?.addEventListener("click", () => void boot());
    document.getElementById("dg-skip")?.addEventListener("click", next);
    document.getElementById("dg-copy")?.addEventListener("click", () => {
      const text = d.checks.map((c) => `${c.ok ? "OK" : "FAIL"} - ${c.name}
${c.detail}`).join("\n\n");
      void navigator.clipboard?.writeText(text).catch(() => void 0);
    });
  }
  async function boot() {
    root.innerHTML = `<div class="boot"><div class="msg info">در حال تست ارتباط با CRM…</div></div>`;
    let diag = null;
    try {
      diag = await call("diagnose");
    } catch (e) {
      root.innerHTML = `<div class="boot"><div class="msg err">${esc(e instanceof Error ? e.message : String(e))}</div></div>`;
      return;
    }
    if (!diag.ok) {
      showDiagnosis(diag, () => void start());
      return;
    }
    await start();
  }
  async function start() {
    let status;
    try {
      status = await call("status");
    } catch (e) {
      root.innerHTML = `<div class="boot"><div class="msg err">${esc(e instanceof Error ? e.message : String(e))}</div></div>`;
      return;
    }
    setUnit(status.currency);
    token = sessionStorage.getItem(TOKEN_KEY) ?? "";
    if (token && status.enabled) {
      try {
        me = await call("me", { token });
        shell();
        return;
      } catch (e) {
        if (!(e instanceof PortalError && e.code === "auth")) console.warn(e);
        token = "";
        sessionStorage.removeItem(TOKEN_KEY);
      }
    }
    showAuth(status);
  }
  function showAuth(status, notice = "") {
    me = null;
    lists.clear();
    mountAuth(root, status, (t) => {
      token = t;
      sessionStorage.setItem(TOKEN_KEY, t);
      void call("me", { token }).then((p) => {
        me = p;
        location.hash = "#/dashboard";
        shell();
      }).catch(failAuth);
    }, notice);
  }
  function failAuth(e) {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    const msg2 = e instanceof PortalError && e.code === "auth" ? e.message : e instanceof Error ? e.message : String(e);
    void call("status").then((st) => showAuth(st, msg2), () => {
      root.innerHTML = `<div class="boot"><div class="msg err">${esc(msg2)}</div></div>`;
    });
  }
  async function guard(p) {
    try {
      return await p;
    } catch (e) {
      if (e instanceof PortalError && e.code === "auth") failAuth(e);
      throw e;
    }
  }
  function shell() {
    const name = me?.fullName || me?.firstName || "مشتری";
    root.innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><div class="logo">DY</div><div><b>پورتال مشتریان</b><small>خدمات آنلاین</small></div></div>
      <nav>${NAV.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}"><i>${i}</i><span>${l}</span></a>`).join("")}</nav>
      <div class="me"><div class="av">${esc((me?.firstName || name).slice(0, 1))}</div><div class="mt"><b>${esc(name)}</b><small dir="ltr">${esc(me?.mobile ?? "")}</small></div><button class="lnk" id="logout" title="خروج">⏻</button></div></aside>
    <main><div class="top"><button class="lnk" id="logout2">خروج ⏻</button></div><div id="view"></div></main>
    <nav class="tabbar">${NAV.filter(([k]) => k !== "activity").map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}"><i>${i}</i><span>${l.replace("فرصت‌های تجاری", "فرصت‌ها").replace("اسناد مالی", "اسناد")}</span></a>`).join("")}</nav>
    <div id="modal" hidden></div></div>`;
    const out = async () => {
      await call("logout", { token }).catch(() => void 0);
      const st = await call("status");
      token = "";
      sessionStorage.removeItem(TOKEN_KEY);
      showAuth(st);
    };
    document.getElementById("logout")?.addEventListener("click", () => void out());
    document.getElementById("logout2")?.addEventListener("click", () => void out());
    if (!location.hash.startsWith("#/")) location.hash = "#/dashboard";
    void route();
  }
  window.addEventListener("hashchange", () => {
    if (token && me) void route();
  });
  function setView(html) {
    const v = document.getElementById("view");
    v.innerHTML = html;
    v.scrollTop = 0;
    return v;
  }
  var loading = () => {
    setView(`<div class="skel"><i></i><i></i><i></i></div>`);
  };
  async function route() {
    const [page = "dashboard", id = ""] = location.hash.replace(/^#\//, "").split("/");
    const seq = ++navSeq;
    if (page !== lastPage && !(id && page === lastPage)) {
      filter = "all";
      query = "";
    }
    lastPage = page;
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === page));
    loading();
    try {
      if (page === "dashboard") {
        const d = await guard(call("dashboard", { token }));
        if (seq !== navSeq) return;
        me = d.profile;
        setView(dashboardView(d));
      } else if (page === "opportunities" || page === "tickets") {
        if (id) {
          const d = await guard(call("detail", { token, kind: page === "tickets" ? "ticket" : "opportunity", id }));
          if (seq !== navSeq) return;
          setView(detailView(page === "tickets" ? "ticket" : "opportunity", d));
        } else {
          const l = await loadList(page);
          if (seq !== navSeq) return;
          renderList(page, l);
        }
      } else if (page === "documents") {
        const l = await loadList(docTab);
        if (seq !== navSeq) return;
        setView(documentsView(docTab, l.rows, l.error));
      } else if (page === "activity") {
        const l = await loadList("activities");
        if (seq !== navSeq) return;
        setView(activityView(l.rows, l.error));
      } else if (page === "profile") {
        const p = await guard(call("me", { token }));
        if (seq !== navSeq) return;
        me = p;
        setView(profileView(p));
      } else location.hash = "#/dashboard";
    } catch (e) {
      if (seq === navSeq && !(e instanceof PortalError && e.code === "auth")) setView(`<div class="msg err">${esc(e instanceof Error ? e.message : String(e))}</div><button class="btn" data-go="dashboard">بازگشت</button>`);
    }
  }
  async function loadList(kind, force = false) {
    const hit = lists.get(kind);
    if (hit && !force) return hit;
    const l = await guard(call("list", { token, kind }));
    lists.set(kind, l);
    return l;
  }
  function renderList(kind, l) {
    const v = setView(listView(kind, l.rows, filter, query, l.error));
    const q = v.querySelector("#q");
    q?.addEventListener("input", () => {
      query = q.value;
      const pos = q.selectionStart;
      renderList(kind, l);
      const n = document.getElementById("q");
      n.focus();
      n.setSelectionRange(pos, pos);
    });
  }
  function onClick(e) {
    const t = e.target.closest("[data-go],[data-act],[data-filter],[data-doc],[data-close]");
    if (!t) return;
    if (t.dataset.go) {
      location.hash = "#/" + t.dataset.go;
    } else if (t.dataset.filter) {
      filter = t.dataset.filter;
      const page = location.hash.includes("tickets") ? "tickets" : "opportunities";
      const l = lists.get(page);
      if (l) renderList(page, l);
    } else if (t.dataset.doc) {
      docTab = t.dataset.doc;
      void route();
    } else if (t.dataset.close !== void 0) closeModal();
    else if (t.dataset.act === "new-ticket") openTicketModal();
    else if (t.dataset.act === "new-request") openRequestModal();
  }
  root.addEventListener("click", onClick);
  root.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.id === "reply") {
      e.preventDefault();
      void submitReply(f);
    } else if (f.id === "profile-form") {
      e.preventDefault();
      void submitProfile(f);
    } else if (f.id === "mobile-form") {
      e.preventDefault();
      void submitMobile(f);
    }
  });
  var showErr = (f, m) => {
    const s = f.querySelector(".err-slot");
    if (s) s.innerHTML = m ? `<div class="msg err" role="alert">${esc(m)}</div>` : "";
  };
  var msg = (e) => e instanceof Error ? e.message : String(e);
  var busy = (f, on) => f.querySelectorAll("button[type=submit]").forEach((b) => {
    b.disabled = on;
  });
  async function submitReply(f) {
    const id = location.hash.split("/")[2] ?? "";
    const ta = f.querySelector("#reply-text");
    if (!ta.value.trim()) return showErr(f, "متن پیام را بنویسید.");
    busy(f, true);
    showErr(f, "");
    try {
      await guard(call("replyTicket", { token, id, text: ta.value.trim() }));
      lists.delete("tickets");
      await route();
    } catch (e) {
      showErr(f, msg(e));
      busy(f, false);
    }
  }
  async function submitProfile(f) {
    const v = (id) => (f.querySelector("#" + id)?.value ?? "").trim();
    busy(f, true);
    showErr(f, "");
    try {
      me = await guard(call("updateProfile", { token, patch: { email: v("p-email"), phone: toLatinDigits(v("p-phone")), jobTitle: v("p-job"), city: v("p-city"), postal: toLatinDigits(v("p-postal")), address: v("p-address") } }));
      setView(profileView(me));
      document.getElementById("view")?.insertAdjacentHTML("afterbegin", `<div class="msg ok" role="status">تغییرات ذخیره شد ✓</div>`);
    } catch (e) {
      showErr(f, msg(e));
      busy(f, false);
    }
  }
  async function submitMobile(f) {
    const raw = f.querySelector("#m-new")?.value ?? "";
    busy(f, true);
    showErr(f, "");
    try {
      const step = await guard(call("mobileChangeStart", { token, mobile: raw }));
      otpForMobile(step);
    } catch (e) {
      showErr(f, msg(e));
      busy(f, false);
    }
  }
  function otpForMobile(step) {
    const box = document.getElementById("mob");
    if (!box) return;
    box.innerHTML = `<p class="mu sm">کد ۶ رقمی به <b dir="ltr">${esc(step.maskedMobile)}</b> پیامک شد.</p>
    <form id="mobile-otp" novalidate><label class="f"><span>کد تایید</span><input id="m-code" class="otp" type="text" inputmode="numeric" dir="ltr" maxlength="8" autofocus></label><div class="err-slot"></div><button class="btn pri" type="submit">تایید و تغییر شماره</button></form>`;
    box.querySelector("#mobile-otp").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      busy(f, true);
      showErr(f, "");
      void guard(call("mobileChangeVerify", { token, flowId: step.flowId, code: toLatinDigits(f.querySelector("#m-code").value) })).then((p) => {
        me = p;
        setView(profileView(p));
        document.getElementById("view")?.insertAdjacentHTML("afterbegin", `<div class="msg ok">شمارهٔ موبایل تغییر کرد ✓</div>`);
      }).catch((err) => {
        showErr(f, msg(err));
        busy(f, false);
      });
    });
    box.querySelector("#m-code")?.focus();
  }
  function openModal(title, body) {
    const m = document.getElementById("modal");
    m.hidden = false;
    m.innerHTML = `<div class="ov" data-close></div><div class="dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="ch"><h3>${esc(title)}</h3><button class="lnk" data-close aria-label="بستن">✕</button></div>${body}</div>`;
    m.querySelector("input,textarea")?.focus();
    return m;
  }
  function closeModal() {
    const m = document.getElementById("modal");
    if (m) {
      m.hidden = true;
      m.innerHTML = "";
    }
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  function openTicketModal() {
    const m = openModal("تیکت جدید", `<form id="new-ticket" novalidate><label class="f"><span>موضوع</span><input id="t-title" type="text" maxlength="200"></label>
    <label class="f"><span>توضیحات</span><textarea id="t-desc" rows="4" maxlength="4000"></textarea></label>
    <label class="f"><span>اولویت</span><select id="t-pri"><option value="1">زیاد</option><option value="2" selected>معمولی</option><option value="3">کم</option></select></label><div class="err-slot"></div>
    <div class="acts"><button class="btn" type="button" data-close>انصراف</button><button class="btn pri" type="submit">ثبت تیکت</button></div></form>`);
    m.querySelector("#new-ticket").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const title = f.querySelector("#t-title").value.trim();
      if (!title) return showErr(f, "موضوع تیکت را بنویسید.");
      busy(f, true);
      showErr(f, "");
      void guard(call("createTicket", { token, title, description: f.querySelector("#t-desc").value.trim(), priority: Number(f.querySelector("#t-pri").value) })).then((r) => {
        closeModal();
        lists.delete("tickets");
        location.hash = "#/tickets/" + r.id;
        if (location.hash === "#/tickets/" + r.id) void route();
      }).catch((err) => {
        showErr(f, msg(err));
        busy(f, false);
      });
    });
  }
  function openRequestModal() {
    const m = openModal("درخواست جدید", `<form id="new-req" novalidate><p class="mu sm">درخواست شما به‌عنوان یک فرصت تجاری ثبت و توسط کارشناس پیگیری می‌شود.</p>
    <label class="f"><span>عنوان درخواست</span><input id="r-title" type="text" maxlength="200"></label>
    <label class="f"><span>توضیحات</span><textarea id="r-desc" rows="4" maxlength="4000"></textarea></label><div class="err-slot"></div>
    <div class="acts"><button class="btn" type="button" data-close>انصراف</button><button class="btn pri" type="submit">ثبت درخواست</button></div></form>`);
    m.querySelector("#new-req").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const title = f.querySelector("#r-title").value.trim();
      if (!title) return showErr(f, "عنوان درخواست را بنویسید.");
      busy(f, true);
      showErr(f, "");
      void guard(call("createRequest", { token, title, description: f.querySelector("#r-desc").value.trim() })).then((r) => {
        closeModal();
        lists.delete("opportunities");
        location.hash = "#/opportunities/" + r.id;
        if (location.hash === "#/opportunities/" + r.id) void route();
      }).catch((err) => {
        showErr(f, msg(err));
        busy(f, false);
      });
    });
  }
  void boot();
})();
