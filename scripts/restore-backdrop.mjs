/**
 * Restores the ORIGINAL backdrop photograph into the project.
 *
 *   node scripts/restore-backdrop.mjs           # only when the file is missing
 *   node scripts/restore-backdrop.mjs --force   # re-download and overwrite
 *
 * Downloads `assets/img/bcg.jpg` from the game's repository (raw GitHub first,
 * then the published GitHub Pages site, then the jsDelivr mirror) straight into
 * `public/assets/img/bcg.jpg`, so the photo is part of the working tree again
 * and both builds ship it locally. No generated or substituted picture is ever
 * used: the only accepted sources are the ones listed in SOURCES.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Where the file belongs inside the project. */
export const BACKDROP_PATH = path.join(root, "public", "assets", "img", "bcg.jpg");

/** Original file locations, tried in order. */
export const SOURCES = [
  "https://raw.githubusercontent.com/Loleus/fullspeed/main/assets/img/bcg.jpg",
  "https://loleus.github.io/fullspeed/assets/img/bcg.jpg",
  "https://cdn.jsdelivr.net/gh/Loleus/fullspeed@main/assets/img/bcg.jpg",
];

/**
 * @returns {Promise<{status:"present"|"restored"|"failed", source?:string, bytes?:number}>}
 */
export async function restoreBackdrop({ force = false, log = console.log } = {}) {
  if (!force) {
    const present = await access(BACKDROP_PATH).then(
      () => true,
      () => false,
    );
    if (present) {
      log("✔ backdrop: public/assets/img/bcg.jpg is already in place");
      return { status: "present" };
    }
  }

  for (const url of SOURCES) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        log(`• ${url} → HTTP ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      // a photo is ~150 kB; anything tiny is an error page or a redirect stub
      if (buffer.byteLength < 2048) {
        log(`• ${url} → suspiciously small (${buffer.byteLength} B), skipped`);
        continue;
      }
      await mkdir(path.dirname(BACKDROP_PATH), { recursive: true });
      await writeFile(BACKDROP_PATH, buffer);
      log(
        `✔ backdrop restored: public/assets/img/bcg.jpg ← ${url} (${Math.round(
          buffer.byteLength / 1024,
        )} kB)`,
      );
      return { status: "restored", source: url, bytes: buffer.byteLength };
    } catch (error) {
      log(`• ${url} → ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  log(
    [
      "✖ backdrop photo could not be downloaded (offline?).",
      "  Put your file at public/assets/img/bcg.jpg – both builds copy it.",
      "  The published CSS still falls back to the absolute URLs at runtime.",
    ].join("\n"),
  );
  return { status: "failed" };
}

// run directly?  (`node scripts/restore-backdrop.mjs [--force]`)
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const result = await restoreBackdrop({ force: process.argv.includes("--force") });
  process.exit(result.status === "failed" ? 1 : 0);
}
