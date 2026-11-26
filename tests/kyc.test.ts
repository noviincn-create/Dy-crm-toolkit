// KYC smoke test (jsdom): mounts on a Quick Create contact form and walks check -> details -> OTP -> form fill,
// with chrome.runtime.sendMessage and the Dynamics Web API mocked.  Usage: tsx tests/kyc.test.ts dist/content/kyc.js
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const CODE = fs.readFileSync(process.argv[2] || 'dist/content/kyc.js', 'utf8');
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (f: () => any, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = f(); if (v) return v; await sleep(20); } return null; };

// valid Iranian national code, computed with the official checksum
const nine = '049937089';
const r = [...nine].reduce((s, d, i) => s + Number(d) * (10 - i), 0) % 11;
const CODE10 = nine + (r < 2 ? r : 11 - r);

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="qc"><div class="hdr"><span>Quick Create: Contact</span></div>
    <div id="form"><div data-id="firstname.fieldControl"><input></div><div data-id="lastname.fieldControl"><input></div>
      <div data-id="mobilephone.fieldControl"><input></div></div></div></body></html>`,
  { url: 'https://test.crm.systan.com/main.aspx?pagetype=entityrecord', runScripts: 'outside-only', pretendToBeVisual: true });
const w: any = dom.window;
const sent: any[] = [];
w.chrome = { runtime: { sendMessage: async (m: any) => {
  sent.push(m);
  if (m.type === 'getConfig') return { config: { autoSave: false, titleField: 'systan_titlebase', titleMale: '728940000', titleFemale: '728940001', accountNationalField: 'systan_nationalidbase' } };
  if (m.type === 'zohal') return { status: 200, json: { result: 1, response_body: { data: { matched: true, first_name: 'علی', last_name: 'رضایی', father_name: 'حسن', gender: true } } } };
  return {};
} } };
w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ value: [] }) }); // nothing exists in Dynamics yet
w.eval(CODE);

(async () => {
  const host = await waitFor(() => w.document.getElementById('kyc-root'));
  ok(!!host, 'KYC block mounted in the Quick Create form');
  const $ = (id: string) => host.shadowRoot.getElementById(id);
  const type = (id: string, v: string) => { const el = $(id) as HTMLInputElement; el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

  type('code', '1111111111');
  $('go')!.click();
  ok(/معتبر نیست/.test($('msg')!.textContent || ''), 'invalid national code rejected');

  type('code', CODE10);
  $('go')!.click();
  ok(!!(await waitFor(() => !($('birthRow') as HTMLElement).hidden)), 'check -> details step (birth date + mobile shown)');

  type('birth', '۱۳۷۷/۰۶/۳۰');
  type('mobile', '۰۹۱۲۱۲۳۴۵۶۷');
  $('go')!.click();
  ok(!!(await waitFor(() => !($('otpRow') as HTMLElement).hidden)), 'details -> OTP step after Zohal + SMS');
  const z = sent.find((m) => m.type === 'zohal');
  ok(z && z.body.national_code === CODE10 && z.body.birth_date === '1377/06/30', 'Zohal called with Latin digits and padded Jalali date');
  ok(sent.some((m) => m.type === 'otpSend' && m.mobile === '9121234567'), 'OTP requested for the normalised mobile');

  type('otp', '123456');
  $('go')!.click();
  const first = w.document.querySelector('[data-id^="firstname."] input') as HTMLInputElement;
  ok(!!(await waitFor(() => first.value === 'علی')), 'form first name filled from Zohal data');
  ok((w.document.querySelector('[data-id^="lastname."] input') as HTMLInputElement).value === 'رضایی', 'form last name filled');
  ok((w.document.querySelector('[data-id^="mobilephone."] input') as HTMLInputElement).value === '09121234567', 'mobile filled with leading 0');
  ok(sent.some((m) => m.type === 'otpVerify' && m.code === '123456'), 'OTP verified through the background worker');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
