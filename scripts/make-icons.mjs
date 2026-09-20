/**
 * Rasterises the vector icons into PNGs.
 *
 *   node scripts/make-icons.mjs
 *
 * Why: SVG icons are crisp at every size and are understood by Chrome/Edge
 * (and used by this app right away), but a few targets still insist on bitmaps –
 * older iOS home-screen icons and some PWA/store validators. This script turns
 * `public/icons/icon-512.svg` into the complete PNG set.
 *
 * It needs `sharp` (a native module, installed on demand – deliberately NOT a
 * project dependency, so a plain `npm install` stays light):
 *
 *   npm i -D sharp && node scripts/make-icons.mjs
 *
 * Existing PNGs (apple-touch-icon-180.png, icon-maskable-512.png) are left
 * untouched unless you pass --force, so hand-made art is never overwritten
 * accidentally.
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, "public", "icons");
const outDir = srcDir;

/** [file, source svg, size, pad] – pad shrinks the art inside the canvas */
const TARGETS = [
  ["icon-64.png", "icon-512.svg", 64, 0],
  ["icon-128.png", "icon-512.svg", 128, 0],
  ["icon-192.png", "icon-512.svg", 192, 0],
  ["icon-256.png", "icon-512.svg", 256, 0],
  ["icon-512.png", "icon-512.svg", 512, 0],
  ["favicon-32.png", "icon-512.svg", 32, 0],
  ["apple-touch-icon-180.png", "icon-512.svg", 180, 0],
  ["apple-touch-icon-152.png", "icon-512.svg", 152, 0],
  ["apple-touch-icon-120.png", "icon-512.svg", 120, 0],
  ["icon-maskable-512.png", "icon-512.svg", 512, 0.2]
];

const force = process.argv.includes("--force");

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error(
    [
      "✖ `sharp` is not installed.",
      "",
      "  npm i -D sharp",
      "  node scripts/make-icons.mjs",
      "",
      "Without it the app keeps using the SVG icons (public/icons/*.svg),",
      "which are vectors and therefore sharp at every size anyway.",
    ].join("\n")
  );
  process.exit(0);
}

await mkdir(outDir, { recursive: true });

for (const [file, svgName, size, pad] of TARGETS) {
  const outPath = path.join(outDir, file);
  if (!force) {
    const exists = await access(outPath).then(
      () => true,
      () => false
    );
    if (exists) {
      console.log(`• ${file} – exists, skipped (use --force to overwrite)`);
      continue;
    }
  }

  const svg = await readFile(path.join(srcDir, svgName));
  const inner = Math.round(size * (1 - pad * 2));
  const offset = Math.round((size - inner) / 2);

  const png = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "contain" })
    .extend({
      top: offset,
      bottom: size - inner - offset,
      left: offset,
      right: size - inner - offset,
      background: "#2f6b2c",
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(outPath, png);
  console.log(`✔ ${file} (${size}×${size})`);
}
console.log("\nDone. Reload the page; the manifest keeps SVG entries as a fallback.");
