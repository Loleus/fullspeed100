/**
 * Service-worker registration. Only the PWA build registers it – portal builds
 * (CrazyGames, Yandex, itch.io …) are embedded by the host and must not install
 * a worker of their own.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.VITE_BUILD_TARGET !== "pwa") return;
  if (!("serviceWorker" in navigator)) return;
  // served from file:// (opened straight from disk) – nothing to register
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  window.addEventListener("load", () => {
    // `BASE_URL` keeps this correct on sub-path deployments (GitHub Pages etc.)
    const url = `${import.meta.env.BASE_URL}sw.js`;
    void navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch(() => {
      /* registration is optional – the game works without it */
    });
  });
}
