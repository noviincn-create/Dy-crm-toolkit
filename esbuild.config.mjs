// Bundles every entry point into a self-contained classic script (content scripts cannot be ES modules).
import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm } from "node:fs/promises";

const { version } = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const watch = process.argv.includes("--watch");

const entries = {
  background: "src/background/index.ts",
  "content/close": "src/close/index.ts",
  "content/kyc": "src/kyc/index.ts",
  "content/invoice": "src/invoice/content.ts",
  "content/quick": "src/quick/content.ts",
  "content/footer": "src/footer/content.ts",
  "content/invoice-bridge": "src/invoice/bridge.ts",
  "content/sm-bridge": "src/session-manager/bridge.ts",
  "content/report": "src/report/index.ts",
  "content/report-bridge": "src/report/bridge.ts",
  "options/options": "src/options/options.ts",
};

const options = {
  entryPoints: entries,
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  charset: "utf8", // keep Persian strings readable in the output
  legalComments: "none",
  define: { __VERSION__: JSON.stringify(version) },
  logLevel: "info",
};

async function copyStatic() {
  await mkdir("dist", { recursive: true });
  await cp("public", "dist", { recursive: true });
}

if (watch) {
  await copyStatic();
  const ctx = await context(options);
  await ctx.watch();
} else {
  await rm("dist", { recursive: true, force: true });
  await copyStatic();
  await build(options);
}
