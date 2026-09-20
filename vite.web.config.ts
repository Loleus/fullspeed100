import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { backdropPhotoPlugin } from "./vite.backdrop-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * `build:web` – plain MULTIFILE build for portals (CrazyGames, Yandex Games,
 * itch.io …): regular hashed JS/CSS in `dist-web/assets`, relative URLs
 * (`base: "./"`) so the zip works from any sub-directory or iframe, no service
 * worker and NO fullscreen UI (portals provide their own).
 *
 * Run with:  node build.mjs web      (or: vite build --config vite.web.config.ts)
 */
/**
 * Portal builds are uploaded as a ZIP and served from the host's own player, so
 * the absolute published address from `.env` (`https://loleus.github.io/…`)
 * would point at somebody else's domain. This plugin rewrites it to a relative
 * path AFTER Vite substituted `%VITE_SITE_URL%`, which keeps `index.html`
 * self-contained for CrazyGames / Yandex / itch.io.
 */
const relativizeSiteUrl = {
  name: "relativize-site-url",
  transformIndexHtml: {
    order: "post" as const,
    handler: (html: string) => html.replaceAll("https://loleus.github.io/fullspeed/", "./"),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), relativizeSiteUrl, backdropPhotoPlugin()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  base: "./",
  define: {
    "import.meta.env.VITE_BUILD_TARGET": JSON.stringify("web"),
    // the bundle's constants (music, logo font) fall back to relative paths as
    // well – a portal ZIP must never pull assets from another domain
    "import.meta.env.VITE_SITE_URL": JSON.stringify("./"),
  },
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    // broad browser support – portal iframes are often older engines
    target: "es2017",
    sourcemap: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 2000,
  },
});
