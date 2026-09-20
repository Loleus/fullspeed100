import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { backdropPhotoPlugin } from "./vite.backdrop-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * `build:pwa` – installable PWA, everything inlined into ONE index.html
 * (JS + CSS + Phaser), next to the files copied from `public/`:
 * manifest.webmanifest, sw.js, icon-512.png, og-image.png.
 *
 * Run with:  node build.mjs pwa      (or: vite build --config vite.pwa.config.ts)
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), backdropPhotoPlugin()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  define: {
    "import.meta.env.VITE_BUILD_TARGET": JSON.stringify("pwa"),
  },
  build: {
    outDir: "dist-pwa",
    emptyOutDir: true,
    target: "es2018",
    sourcemap: false,
    // a single chunk is the whole point of the single-file build
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
