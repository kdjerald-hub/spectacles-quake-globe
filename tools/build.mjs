// Builds the shared core for both targets from one TypeScript source of truth.
//
//   core/*.ts, data/*.ts
//     -> web-preview/js/{core,data}/*.js   (types stripped, ".ts" imports -> ".js")
//     -> lens/Assets/QuakeGlobe/{Core,Data}/*.ts   (copied, ".ts" imports -> extensionless)
//
// No dependencies: type stripping uses Node's built-in module.stripTypeScriptTypes.

import { stripTypeScriptTypes } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sources = [
  { dir: "core", web: "web-preview/js/core", lens: "lens/Assets/QuakeGlobe/Core" },
  { dir: "data", web: "web-preview/js/data", lens: "lens/Assets/QuakeGlobe/Data" },
];

// Matches the module specifier of static import/export statements that end in ".ts".
const SPECIFIER = /(\bfrom\s*["'])(\.{1,2}\/[^"']+)\.ts(["'])/g;
// The Lens folders are capitalised (Core/, Data/) and the repo's are not. Lens Studio's TypeScript
// rejects an import that differs from the real path only in case (TS1261), so map them.
const LENS_DIR = /(\bfrom\s*["'])\.\.\/(core|data)\//g;
const toLensDir = (_m, from, dir) => from + "../" + dir[0].toUpperCase() + dir.slice(1) + "/";

const banner = (src) =>
  "// GENERATED from " + src + " by tools/build.mjs. Edit the source, then run `npm run build`.\n";

let count = 0;
for (const s of sources) {
  const webOut = join(root, s.web);
  const lensOut = join(root, s.lens);
  rmSync(webOut, { recursive: true, force: true });
  mkdirSync(webOut, { recursive: true });
  mkdirSync(lensOut, { recursive: true });
  // The Lens copy is overwritten in place, never wiped: Lens Studio keeps a .meta file
  // (the asset's identity) next to every script. Only files whose source is gone are
  // removed, together with their .meta.
  const wanted = new Set(readdirSync(join(root, s.dir)).filter((n) => n.endsWith(".ts")));
  for (const name of readdirSync(lensOut)) {
    const base = name.endsWith(".meta") ? name.slice(0, -5) : name;
    if (base.endsWith(".ts") && !wanted.has(base)) rmSync(join(lensOut, name), { force: true });
  }
  for (const name of readdirSync(join(root, s.dir))) {
    if (!name.endsWith(".ts")) continue;
    const srcPath = s.dir + "/" + name;
    const code = readFileSync(join(root, srcPath), "utf8");

    const js = stripTypeScriptTypes(code, { mode: "strip" }).replace(SPECIFIER, "$1$2.js$3");
    writeFileSync(join(webOut, name.replace(/\.ts$/, ".js")), banner(srcPath) + js);

    const lensTs = code.replace(SPECIFIER, "$1$2$3").replace(LENS_DIR, toLensDir);
    writeFileSync(join(lensOut, name), banner(srcPath) + lensTs);
    count++;
  }
}
console.log("built " + count + " modules for web-preview/ and lens/");
