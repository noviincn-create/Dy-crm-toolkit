# DY CRM Toolkit (TypeScript)

افزونهٔ Chrome (MV3) برای Dynamics 365 on-prem 9.1: چاپ فاکتور فارسی، شماره‌گذاری ماهانهٔ فرصت، احراز هویت زحل (KYC)، بستن فرصت به‌عنوان برنده، ابزار محصول، پاورقی چاپی و پنل جلسه (رابط کاربری بازطراحی‌شده؛ چند جلسهٔ هم‌زمان؛ زمان جلسه روی فرصت‌های فقط-پرینت اضافه نمی‌شود).

## ساختار
```
src/
  shared/      config, messages (قرارداد تایپ‌شدهٔ پیام‌ها), jalali (تقویم + زمان تهران), odata (کلاینت Web API), text, xrm
  background/  service worker (زحل + IPPanel + OTP)
  kyc/         پنل KYC (ISOLATED world)
  invoice/     bridge (ISOLATED) + content (MAIN): دادهٔ فاکتور، رندر فرم استاندارد «صورت‌حساب فروش کالا و خدمات» (A4 افقی؛ شمارهٔ سریال = شمارهٔ فرصت)، استایل چاپ، fonts.ts (فونت‌های یکان و تیتر embed شده؛ تولید با tools/embed-fonts.mjs)
  close/       ابزارهای فرصت (MAIN): stages, win-dialog, stage-dialog, opp-number, create-dialog, session, products, ui/
  footer/      پاورقی چاپی (css.ts: ساخت @page margin boxes، content.ts: ISOLATED، بازسازی در beforeprint)
  quick/       جلسهٔ سریع (ISOLATED، همهٔ سایت‌ها): دابل‌تپ Shift = شروع (عنوان + لیست قیمت + محصولات)، دابل‌تپ Ctrl = پایان؛ Esc می‌بندد. فراخوانی‌های CRM در background/quick.ts با کوکی مرورگر
  report/      داشبورد فروش (MAIN، آدرس novinvn://report، omnibox «nv»): data/dates/view/export + bridge؛ background/report.ts = omnibox. راهنما: docs/NOVINVN.md
  options/     صفحهٔ تنظیمات
  types/       تایپ‌های ambient برای Xrm و window
public/        manifest.json, options.html, فونت فاکتور
tests/         تست‌های jsdom (+ Playwright برای فاکتور)
tools/         اسکریپت یک‌بارمصرف مهاجرت شماره‌ها؛ protocol/ = هندلر ویندوز برای novinvn://
```

## دستورها
```
npm install
npm run typecheck      # tsc strict روی src، و تنظیمات سبک‌تر روی tests
npm run build          # خروجی در dist/ (همان پوشه‌ای که در chrome://extensions با Load unpacked انتخاب می‌شود)
npm test               # build + همهٔ تست‌های jsdom
npm run test:invoice   # نیاز به: npx playwright install chromium
npm run build:tools    # dist-tools/migrate-opportunity-number.js برای paste در کنسول
npm run watch
```
هر entry به‌صورت IIFE مستقل باندل می‌شود (content scriptها نمی‌توانند ES module باشند).
