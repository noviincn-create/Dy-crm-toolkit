// Print footer (jsdom): style built from settings, refreshed on beforeprint / settings change, removed when disabled.
// Usage: tsx tests/footer.test.ts dist/content/footer.js
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const quiet = new VirtualConsole(); // jsdom's CSS parser does not know @page margin boxes (Chrome does)

const CODE = fs.readFileSync(process.argv[2] || 'dist/content/footer.js', 'utf8');
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function boot(stored: any) {
  const dom = new JSDOM('<!doctype html><html><head><title>فرصت تست</title></head><body></body></html>',
    { url: 'https://novincn.crm.systan.com/main.aspx?appid=1&pagetype=entityrecord&etn=opportunity&id=abc&navbar=off&forceUCI=1#x', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: quiet });
  const w: any = dom.window;
  let listener: any = null;
  w.chrome = { storage: { local: { get: async () => ({ footerCfg: stored }) }, onChanged: { addListener: (f: any) => { listener = f; } } } };
  w.eval(CODE);
  return { w, change: (v: any) => listener({ footerCfg: { newValue: v } }, 'local') };
}
const css = (w: any): string => w.document.getElementById('dy-footer-css')?.textContent ?? '';

(async () => {
  const { w, change } = boot({});
  await sleep(30);
  let c = css(w);
  ok(/@bottom-right\{content:"صفحه " counter\(page,persian\) " از " counter\(pages,persian\)/.test(c), 'page X of Y (Persian digits) bottom-right');
  ok(/@bottom-left\{content:"[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}\s+[۰-۹]{2}:[۰-۹]{2}"/.test(c), 'Jalali date + time bottom-left: ' + (c.match(/@bottom-left\{content:"([^"]*)"/) || [])[1]);
  ok(c.includes('فرصت تست'), 'title in the centre box');
  ok(c.includes('main.aspx?appid=1&pagetype=entityrecord&etn=opportunity&id=abc') && !c.includes('navbar') && !c.includes('#x'), 'URL trimmed to identifying params, no hash');
  ok(w.document.getElementById('dy-footer-css').media === 'print', 'style applies to print only');
  // title changes (SPA navigation) -> picked up on beforeprint
  w.document.title = 'فرصت دوم';
  w.dispatchEvent(new w.Event('beforeprint'));
  ok(css(w).includes('فرصت دوم') && !css(w).includes('فرصت تست'), 'beforeprint refreshes the title');
  // settings: no URL trimming, no date
  change({ trimUrl: false, date: false });
  ok(css(w).includes('navbar=off') && !css(w).includes('@bottom-left'), 'settings change applied live (full URL, no date)');
  change({ title: false, url: false, page: false, date: false });
  ok(css(w) === '', 'nothing selected -> no stylesheet');
  change({ enabled: false });
  ok(!w.document.getElementById('dy-footer-css'), 'disabled -> style removed');
  // quotes in titles cannot break the stylesheet
  change({});
  w.document.title = 'a "b" \\ c';
  w.dispatchEvent(new w.Event('beforeprint'));
  ok(css(w).includes('a \\"b\\" \\\\ c'), 'quotes / backslashes escaped');
  // iframes are skipped
  const parent = new JSDOM('<!doctype html><html><body><iframe></iframe></body></html>', { url: 'https://x.crm.systan.com/', runScripts: 'outside-only', virtualConsole: quiet });
  const fw: any = (parent.window.document.querySelector('iframe') as HTMLIFrameElement).contentWindow;
  fw.chrome = { storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } } };
  fw.eval(CODE); await sleep(30);
  ok(!fw.document.getElementById('dy-footer-css'), 'sub-frames get no footer');
  console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
