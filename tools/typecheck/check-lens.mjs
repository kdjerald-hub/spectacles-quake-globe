// Type-checks the Lens scripts without Lens Studio, in strict mode, against an official
// Lens Studio API declaration file and a Spectacles Interaction Kit source tree.
//
//   node tools/typecheck/check-lens.mjs --dts <studio.d.ts> --sik <SIK root> --uikit <UI Kit root>
//
// <studio.d.ts>  https://developers.snap.com/lens-studio/api/downloads/studio.d.ts
//                (older versions are on the Wayback Machine)
// <SIK root>     the folder that contains Components/, Core/, Providers/ ...
//                In a Lens Studio project: Cache/TypeScript/Src/Packages/SpectaclesInteractionKit.lspkg
// <UI Kit root>  the folder that contains Scripts/ ...
//                In a Lens Studio project: Cache/TypeScript/Src/Packages/SpectaclesUIKit.lspkg
//
// Needs network access once for `npx typescript@5.5.4`. Prints only errors in this
// project's files; errors inside SIK come from Lens Studio's generated declarations,
// which are not public, and are ignored.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? resolve(process.argv[i + 1]) : "";
};
const dts = arg("--dts");
const sik = arg("--sik");
const uikit = arg("--uikit");
if (!dts || !sik || !uikit) {
  console.error("usage: node tools/typecheck/check-lens.mjs --dts <studio.d.ts> --sik <SIK root> --uikit <UI Kit root>");
  process.exit(2);
}

const lens = join(root, "lens", "Assets", "QuakeGlobe", "Scripts");
const tmp = join(here, ".tmp");
mkdirSync(tmp, { recursive: true });
const tsconfig = join(tmp, "tsconfig.json");
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      // Mirrors the options Lens Studio's own packages are compiled with.
      compilerOptions: {
        target: "es2021",
        lib: ["es2021"],
        module: "commonjs",
        moduleResolution: "node",
        isolatedModules: true,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        noImplicitOverride: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        types: [],
        baseUrl: tmp,
        paths: {
          "SpectaclesInteractionKit.lspkg/*": [join(sik, "*")],
          "SpectaclesUIKit.lspkg/*": [join(uikit, "*")],
        },
      },
      files: [dts, join(here, "lensify-shim.d.ts"), join(lens, "QuakeGlobeLens.ts"), join(lens, "LensUi.ts"), join(lens, "LensRender.ts")],
    },
    null,
    2,
  ),
);

const r = spawnSync("npx", ["--yes", "-p", "typescript@5.5.4", "tsc", "-p", tsconfig], { encoding: "utf8" });
const ours = (r.stdout + r.stderr).split("\n").filter((l) => l.includes("QuakeGlobe") && l.includes("error TS"));
if (ours.length === 0) {
  console.log("OK: no type errors in the Lens scripts or the shared core");
} else {
  console.log(ours.join("\n"));
  process.exit(1);
}
