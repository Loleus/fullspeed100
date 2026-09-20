/// <reference types="vite/client" />

/**
 * Build-target flags injected by the Vite configs:
 *   "pwa"  – installable single-file build (registers the service worker)
 *   "web"  – multifile portal build (no service worker, no fullscreen UI)
 * Undefined for the plain `npm run build`.
 */
interface ImportMetaEnv {
  readonly VITE_BUILD_TARGET?: "pwa" | "web";
  /** Published address of the game, always with a trailing slash. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
