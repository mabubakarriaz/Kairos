// CI budget gate: the initial JS bundle must be ≤ 80 KB gzipped (research NFR table).
// Reads the Vite manifest and gzips the entry chunk (+ its eager imports).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const DIST = resolve("src/Kairos.Web/wwwroot/dist");
const BUDGET_KB = 80;

const manifest = JSON.parse(readFileSync(resolve(DIST, "vite-manifest.json"), "utf8"));
const entry = manifest["src/main.ts"];
if (!entry) {
  console.error("✖ entry 'src/main.ts' not found in vite-manifest.json — did you run the Vite build?");
  process.exit(1);
}

const files = new Set([entry.file, ...(entry.imports ?? []).flatMap((k) => manifest[k]?.file ?? [])]);
let gzBytes = 0;
for (const file of files) {
  gzBytes += gzipSync(readFileSync(resolve(DIST, file))).length;
}

const kb = gzBytes / 1024;
console.log(`Initial JS gzipped: ${kb.toFixed(1)} KB (budget ${BUDGET_KB} KB) — ${[...files].join(", ")}`);

if (kb > BUDGET_KB) {
  console.error(`✖ Bundle-size budget exceeded by ${(kb - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
console.log("✓ Within budget.");
