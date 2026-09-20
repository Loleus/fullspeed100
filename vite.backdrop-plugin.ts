import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Ensures the ORIGINAL backdrop photo (`assets/img/bcg.jpg` from
 * Loleus/fullspeed) is present in the build – and in `public/` – without ever
 * shipping a stand-in picture.
 *
 * Order of business on every build:
 *   1. is `public/assets/img/bcg.jpg` already there (e.g. copied by hand, or by
 *      `node scripts/restore-backdrop.mjs`)? → do nothing,
 *   2. otherwise download the original from the project's repository (raw GitHub,
 *      then the published site, then the jsDelivr CDN mirror) and
 *      – write it into `public/assets/img/bcg.jpg`, so the file is back in the
 *        working tree,
 *      – emit it into the bundle, so this very build already contains it,
 *   3. if every source fails (offline build), warn and carry on: the CSS lists
 *      the absolute URLs as further fallbacks, so the published site still shows
 *      the photo at runtime.
 */
const RELATIVE = ["assets", "img", "bcg.jpg"] as const;

const SOURCES = [
  "https://raw.githubusercontent.com/Loleus/fullspeed/main/assets/img/bcg.jpg",
  "https://loleus.github.io/fullspeed/assets/img/bcg.jpg",
  "https://cdn.jsdelivr.net/gh/Loleus/fullspeed@main/assets/img/bcg.jpg",
];

export function backdropPhotoPlugin(): Plugin {
  const publicFile = path.join(process.cwd(), "public", ...RELATIVE);
  const fileName = RELATIVE.join("/");
  let served = false;

  return {
    name: "fullspeed:backdrop-photo",
    apply: "build",

    async buildStart() {
      if (served) return;
      const present = await access(publicFile).then(
        () => true,
        () => false,
      );
      if (present) {
        this.info(`backdrop photo: using public/${fileName}`);
        served = true;
        return;
      }

      for (const url of SOURCES) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const buffer = Buffer.from(await response.arrayBuffer());
          // a real photo is far bigger than this – guards against error pages
          if (buffer.byteLength < 2048) continue;

          await mkdir(path.dirname(publicFile), { recursive: true });
          await writeFile(publicFile, buffer);
          // make sure it also lands in THIS build, not only in the next one
          this.emitFile({ type: "asset", fileName, source: buffer });

          this.warn(
            `backdrop photo restored from ${url} → public/${fileName} (${Math.round(
              buffer.byteLength / 1024,
            )} kB)`,
          );
          served = true;
          return;
        } catch {
          // try the next source
        }
      }

      this.warn(
        "backdrop photo not found locally and no source could be fetched – " +
          "the CSS falls back to the absolute URLs at runtime (add " +
          `public/${fileName} by hand to fix it permanently)`,
      );
      served = true;
    },
  };
}
