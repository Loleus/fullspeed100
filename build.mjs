/**
 * Build driver for the two distribution targets.
 *
 *   node build.mjs pwa    → dist-pwa  (single-file, installable PWA)
 *   node build.mjs web    → dist-web  (multifile, portal zip, no fullscreen)
 *   node build.mjs all    → both
 *
 * `package.json` is not touched on purpose; if you prefer npm scripts, add:
 *   "build:pwa": "node build.mjs pwa",
 *   "build:web": "node build.mjs web"
 */
import { fileURLToPath } from "node:url";
import { build } from "vite";

const target = (process.argv[2] ?? "all").toLowerCase();

// fileURLToPath keeps the paths valid on Windows too (plain .pathname would
// produce "/C:/…", which vite cannot resolve)
const jobs = {
  pwa: {
    configFile: fileURLToPath(new URL("./vite.pwa.config.ts", import.meta.url)),
    label: "PWA (single file → dist-pwa)",
  },
  web: {
    configFile: fileURLToPath(new URL("./vite.web.config.ts", import.meta.url)),
    label: "WEB (portal zip → dist-web)",
  },
};

const selected = target === "all" ? ["pwa", "web"] : [target];

// ---------------------------------------------------------------------------
// Make sure the ORIGINAL backdrop photo is in the project before building.
// If public/assets/img/bcg.jpg is missing it is downloaded from the game's
// repository; if that is impossible (offline) we only warn – the CSS keeps
// absolute URLs as a runtime fallback.
// ---------------------------------------------------------------------------
const { restoreBackdrop } = await import("./scripts/restore-backdrop.mjs");
await restoreBackdrop();

const t0 = Date.now();
for (const name of selected) {
  const job = jobs[name];
  if (!job) {
    console.error(`Unknown target "${name}". Use: pwa | web | all`);
    process.exit(1);
  }
  console.log(`\n▶ building ${job.label} …`);
  await build({ configFile: job.configFile, logLevel: "info" });
}
console.log(`\n✔ done in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${selected.join(", ")}`);
