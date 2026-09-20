# FULL SPEED — buildy

Trzy warianty, wszystkie z tego samego kodu źródłowego. Różnią się tylko
konfiguracją Vite (i jedną flagą `VITE_BUILD_TARGET`).

| wariant | komenda | wynik | przeznaczenie |
|---|---|---|---|
| domyślny | `npm run build` | `dist/` | podgląd / hosting, single-file |
| **PWA** | `node build.mjs pwa` | `dist-pwa/` | instalowalna aplikacja (manifest + service worker) |
| **WEB** | `node build.mjs web` | `dist-web/` | ZIP dla CrazyGames / Yandex Games / itch.io |

Oba warianty naraz: `node build.mjs all`.

> `package.json` nie jest modyfikowany celowo. Jeśli wolisz skróty, dopisz do
> `scripts`:
> ```json
> "build:pwa": "node build.mjs pwa",
> "build:web": "node build.mjs web"
> ```

## 1. `node build.mjs pwa` → `dist-pwa/`

- **`vite.pwa.config.ts`** – `vite-plugin-singlefile`: JS, CSS i całe Phaser
  wpadają do jednego `index.html` (bez `assets/`).
- Do katalogu kopiowane jest `public/`:
  - `manifest.webmanifest` (standalone, portrait, ikona `icon-512.png`,
    `theme_color #0f2609`),
  - `sw.js` – service worker: precache powłoki, cache-first dla `assets/`
    i zasobów zewnętrznych (Google Fonts, `raw.githubusercontent.com` — font
    Yarin i muzyka), network-first dla nawigacji z fallbackiem na `index.html`,
  - `icon-512.png`, `og-image.png`.
- Rejestracja workera: `src/pwa.ts` (wołane z `src/main.tsx`) — **tylko** gdy
  `VITE_BUILD_TARGET === "pwa"`.
- Pełny ekran: **dostępny** w ustawieniach.

Wgranie: wrzuć całą zawartość `dist-pwa/` na serwer po HTTPS (na GitHub Pages
musi być w korzeniu albo użyj `base` w konfiguracji). Od drugiego wejścia gra
startuje offline.

## 2. `node build.mjs web` → `dist-web/`

- **`vite.web.config.ts`** – zwykły build wieloplikowy: `index.html` +
  `assets/index-*.js` / `assets/index-*.css` (Phaser w osobnym chunku),
- `base: "./"` → ścieżki relatywne, więc ZIP działa z podkatalogu i z iframe’a,
- `target: "es2017"` → szersza zgodność z silnikami w iframe’ach portalowych,
- **brak service workera** (portale same zarządzają cache i wersjonowaniem),
- **pełny ekran ukryty w ustawieniach** (przełącznik nie renderuje się, gdy
  `VITE_BUILD_TARGET === "web"`) — hostowany player portalu decyduje o trybie
  pełnoekranowym,
- `manifest.webmanifest`, `sw.js`, ikony i `og-image.png` trafiają do paczki,
  ale nic ich nie rejestruje — możesz je usunąć przed ZIP-em bez szkody.

Wgranie na portale: spakuj **zawartość** `dist-web/` (nie sam katalog) jako ZIP.
CrazyGames wymaga dodatkowo `index.html` w korzeniu paczki i pliku
`crazygames-sdk` tylko jeśli używasz ich SDK — ta gra go nie potrzebuje.

## Ikony

Ikony są rysowane **tym samym autem i tą samą drogą co gra** (geometria z
`src/game/textures.ts`: pas 48…432 z 480 px, pasy 64 px, linie 0,2 m, czerwone
auto gracza 32×80 px w skali gry).

| plik | rozmiar | zastosowanie |
|---|---|---|
| `public/favicon.svg` | 32 px | favicon (ostry na HiDPI), `mask-icon` Safari |
| `public/icons/icon-64.svg` | 64×64 | manifest, karta przeglądarki |
| `public/icons/icon-128.svg` | 128×128 | manifest |
| `public/icons/icon-192.svg` | 192×192 | manifest (min. rozmiar Androida) |
| `public/icons/icon-256.svg` | 256×256 | manifest |
| `public/icons/icon-512.svg` | 512×512 | manifest, splash |
| `public/icons/apple-touch-icon-180.png` | 180×180 | **iPhone / iPad** (PNG!) |
| `public/icons/icon-maskable-512.png` | 512×512 | `purpose: maskable` (Android) |

Wersje 64 i 128 mają uproszczoną kreskę (grubsze linie), bo cieńsze znaczniki
rozmywają się przy tak małym rozmiarze.

### Pełny zestaw PNG (opcjonalnie)

Kilka walidatorów PWA/store’ów woli bitmapy w każdym rozmiarze. Do tego jest
skrypt (używa `sharp`, celowo nie jest zależnością projektu, żeby `npm install`
był lekki):

```bash
npm i -D sharp
node scripts/make-icons.mjs          # dopisuje brakujące PNG 64…512 + Apple 120/152/180 + maskable
node scripts/make-icons.mjs --force  # nadpisuje także istniejące (np. wygenerowane artystycznie)
```

## Adresy absolutne

Gra jest publikowana pod `https://loleus.github.io/fullspeed/` i **wszystkie**
odwołania są absolutne — bez `./`:

- `.env` → `VITE_SITE_URL=https://loleus.github.io/fullspeed/` (jedno miejsce do
  zmiany, gdy gra się przeniesie),
- `index.html` używa `%VITE_SITE_URL%` w linkach do manifestu, ikon, faviconu i
  w metadanych OG/Twittera,
- `src/game/constants.ts` liczy z tej samej wartości `MUSIC_URL`
  (`…/assets/audio/music.ogg`) i `LOGO_FONT_URL`
  (`…/assets/fonts/FasterOne-Regular.woff2`),
- `src/index.css` w `@font-face` wskazuje logo-font wprost na
  `https://loleus.github.io/fullspeed/assets/fonts/FasterOne-Regular.woff2`
  (Google Fonts nie jest już używany, font jest self-hostowany),
- `public/sw.js` ma zapisany ten sam `SITE_URL` dla precache’u i runtime cache.

**Wyjątek: `build:web`.** Portal (CrazyGames/Yandex/itch.io) serwuje ZIP z
własnej domeny, więc absolutne adresy prowadziłyby do cudzej strony. Dlatego
`vite.web.config.ts` podstawia `import.meta.env.VITE_SITE_URL = "./"` dla kodu
oraz wtyczka `relativize-site-url` przepisuje absolutne adresy w `index.html` na
relatywne. Bazowy i PWA build zostają w pełni absolutne.

## Zdjęcie tła (`assets/img/bcg.jpg`)

W projekcie **nie ma żadnej zastępczej grafiki** – tło to oryginalna fotografia z
`Loleus/fullspeed`. Skąd się bierze:

1. jeśli `public/assets/img/bcg.jpg` istnieje (wrzucone ręcznie lub pobrane
   skryptem) → oba buildy po prostu je kopiują,
2. jeśli pliku nie ma → wtyczka `vite.backdrop-plugin.ts` (podpięta do
   `vite.pwa.config.ts` i `vite.web.config.ts`) pobiera oryginał z repo (raw
   GitHub → strona GitHub Pages → mirror jsDelivr), zapisuje go z powrotem do
   `public/assets/img/bcg.jpg` i wrzuca do bieżącego builda,
3. jeśli sieci nie ma → build kończy się ostrzeżeniem, a CSS nadal wskazuje
   absolutne adresy (`https://loleus.github.io/fullspeed/assets/img/bcg.jpg`
   oraz plik z repo), więc opublikowana gra pokaże zdjęcie.

Ręczne przywrócenie pliku w każdej chwili:

```bash
node scripts/restore-backdrop.mjs           # tylko gdy brakuje
node scripts/restore-backdrop.mjs --force   # pobierz ponownie
```

Dodatkowo `node build.mjs …` (PWA/WEB) **zawsze** uruchamia ten krok przed
buildem (`build.mjs` importuje `restoreBackdrop()`), więc plik wraca do
`public/` sam, nawet gdy go wcześniej nie było. Domyślny `npm run build` zostawia
konfigurację bazową nietkniętą – wystarczy raz uruchomić skrypt albo build
PWA/WEB, a plik zostaje w projekcie na stałe.

## Open Graph

`index.html` zawiera komplet metadanych OG/Twittera z **absolutnym** obrazkiem
`https://loleus.github.io/fullspeed/og-image.png` (1200×630) i `og:url` równym
adresowi publikacji — nic nie trzeba już podmieniać ręcznie.

## Flagi środowiska

| flaga | efekt |
|---|---|
| `VITE_BUILD_TARGET="pwa"` | rejestracja service workera |
| `VITE_BUILD_TARGET="web"` | brak service workera, brak przełącznika pełnego ekranu |
| _brak_ (domyślny `npm run build`) | single-file, pełny ekran dostępny, bez workera |
