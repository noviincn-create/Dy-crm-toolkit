/** Markup + styles of the KYC block (rendered inside a shadow root so Dynamics styles cannot leak in). */
export const panelHtml = (otpLength: number): string => `
    <style>
      :host { display: block; margin: 8px 0 16px; font: 14px/1.65 Vazirmatn, "Segoe UI", Tahoma, sans-serif;
        --bg:#fff; --s2:#f5f6f9; --s3:#eceff4; --tx:#141922; --mu:#667085; --ln:#e4e7ec; --pr:#4f46e5; --pr-h:#4338ca; --on-pr:#fff; --pr-s:#eef0ff;
        --ok:#059669; --ok-s:#e6f6ef; --er:#d92d20; --er-s:#fdeceb; color-scheme: light; }
      @media (prefers-color-scheme: dark) { :host { --bg:#181b24; --s2:#1f2330; --s3:#282d3d; --tx:#eceff5; --mu:#98a2b3; --ln:#2e3445; --pr:#8b93ff;
        --pr-h:#a5abff; --on-pr:#10123a; --pr-s:#262a52; --ok:#34d399; --ok-s:#173a2e; --er:#f97066; --er-s:#40201f; color-scheme: dark; } }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      svg { width: 20px; height: 20px; fill: currentColor; flex: none; }
      section { direction: rtl; padding: 18px; border: 1px solid var(--ln); border-radius: 20px; background: var(--bg); color: var(--tx);
        box-shadow: 0 1px 3px rgba(16,24,40,.08), 0 12px 28px -12px rgba(16,24,40,.18); }
      header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
      .badge { width: 40px; height: 40px; border-radius: 13px; display: grid; place-items: center; color: var(--pr);
        background: linear-gradient(145deg, var(--pr-s), color-mix(in srgb, var(--pr) 22%, var(--pr-s))); }
      h3 { margin: 0; font-size: 15.5px; font-weight: 800; }
      .steps { display: flex; margin: 0 0 18px; padding: 0; list-style: none; counter-reset: s; }
      .steps li { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11.5px; color: var(--mu); font-weight: 600; transition: .2s; }
      .steps li::before { counter-reset: none; content: attr(data-n); width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; z-index: 1;
        background: var(--s3); color: var(--mu); font-size: 12px; font-weight: 800; transition: .2s; }
      .steps li:not(:last-child)::after { content: ""; position: absolute; top: 13px; right: calc(50% + 18px); left: calc(-50% + 18px); height: 2px; background: var(--ln); }
      .steps li:not(:first-child)::after { }
      .steps li.on { color: var(--pr); }
      .steps li.on::before { background: var(--pr); color: var(--on-pr); box-shadow: 0 0 0 4px color-mix(in srgb, var(--pr) 22%, transparent); }
      .steps li.done { color: var(--ok); }
      .steps li.done::before { content: "✓"; background: var(--ok); color: #fff; }
      label { display: block; margin-bottom: 14px; }
      label span { display: block; margin-bottom: 6px; font-size: 12.5px; font-weight: 700; color: var(--mu); }
      input { width: 100%; min-height: 46px; padding: 10px 14px; border: 1px solid var(--ln); border-radius: 12px; background: var(--bg); color: var(--tx);
              font: inherit; font-size: 15px; direction: ltr; text-align: center; letter-spacing: 1px; font-variant-numeric: tabular-nums;
              box-shadow: 0 1px 2px rgba(16,24,40,.06); transition: border-color .15s, box-shadow .15s; }
      input::placeholder { color: var(--mu); opacity: .5; letter-spacing: 0; }
      input:focus { outline: none; border-color: var(--pr); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pr) 28%, transparent); }
      input[aria-invalid="true"] { border-color: var(--er); box-shadow: 0 0 0 3px color-mix(in srgb, var(--er) 18%, transparent); }
      #otp { font-size: 22px; letter-spacing: 10px; font-weight: 800; }
      #msg { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 14px; padding: 10px 13px; border-radius: 12px; background: var(--s2);
             color: var(--mu); font-size: 13px; }
      #msg:empty { display: none; }
      #msg.err { background: var(--er-s); color: var(--er); }
      #msg.ok { background: var(--ok-s); color: var(--ok); }
      button { width: 100%; min-height: 46px; border: 0; border-radius: 12px; padding: 0 12px; background: var(--pr); color: var(--on-pr);
               font: inherit; font-weight: 800; cursor: pointer; transition: background .15s, transform .1s;
               display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
      button:hover:not(:disabled) { background: var(--pr-h); }
      button:active:not(:disabled) { transform: scale(.99); }
      button:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--pr) 35%, transparent); }
      button.link { margin-top: 6px; min-height: 38px; background: none; color: var(--pr); font-weight: 700; }
      button.link:hover:not(:disabled) { background: var(--pr-s); }
      button:disabled { opacity: .55; cursor: default; }
      button.loading { cursor: progress; }
      button.loading::before { content: ""; width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid color-mix(in srgb, currentColor 35%, transparent);
               border-top-color: currentColor; animation: spin .7s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    </style>
    <section>
      <header>
        <span class="badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z"/></svg></span>
        <h3 id="title"></h3>
      </header>
      <ol class="steps" id="steps" aria-hidden="true"><li data-s="check" data-n="۱">جستجو</li><li data-s="details" data-n="۲">احراز هویت</li><li data-s="otp" data-n="۳">تایید موبایل</li></ol>
      <label><span id="codeLabel"></span><input id="code" inputmode="numeric" autocomplete="off" placeholder="----------"></label>
      <label id="birthRow" hidden><span>تاریخ تولد (شمسی)</span>
        <input id="birth" inputmode="numeric" autocomplete="off" placeholder="1377/06/30"></label>
      <label id="mobileRow" hidden><span>شماره موبایل</span>
        <input id="mobile" inputmode="tel" autocomplete="off" placeholder="09121234567"></label>
      <label id="otpRow" hidden><span>کد تایید پیامکی</span>
        <input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="${otpLength}" placeholder="••••••"></label>
      <p id="msg" role="status" aria-live="polite"></p>
      <button type="button" id="go">بررسی</button>
      <button type="button" id="resend" class="link" hidden>ارسال مجدد کد</button>
    </section>`;
