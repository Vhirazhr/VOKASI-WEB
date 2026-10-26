# Landing VOKASI 3D

Homepage `/` uses a six-face CSS 3D plaque, `perspective`, and `preserve-3d`. It is not a WebGL/Three.js mesh. The official logo is rendered intact on the front plane with `object-fit: contain`. This deliberately uses the permitted layered 3D approach without adding a rendering dependency. No device-pixel-ratio canvas or texture allocation is required.

## Official artwork

No logo or mascot asset exists in the source snapshot used for this change. The navbar and hero therefore explicitly show a placeholder, not an invented school identity. Add the approved logo to `public/branding/smkn-1-singosari.png` (prefer a transparent PNG/WebP at 512–1024 px), then set `logoSrc` in `components/landing/identity.ts` to `/branding/smkn-1-singosari.png`. The same configuration updates both placements. Missing/broken images revert to the labelled placeholder. No mascot is displayed until an official asset is supplied.

## Interaction and accessibility

- Mouse position tracks across the viewport with frame-rate-independent interpolation.
- Six faces, a rear ring and a floor shadow create separate depth planes.
- Idle float and subtle rotation; pointer inactivity returns to neutral after 1.1 seconds.
- Mouse/touch horizontal drag uses pointer capture; rotation is capped at 26° horizontally / 20° vertically. Vertical touch scrolling is preserved (`touch-action: pan-y`); browser scroll cancellation safely releases drag.
- Focus the scene and use arrow keys to rotate, Home to reset.
- Pause button resets and stops the frame loop. Reduced-motion preference disables movement. Background tabs stop rendering, with cleanup on unmount.
- No WebGL requirement; static front face fallback for browsers without CSS preserve-3d. Links and heading remain server-rendered without JavaScript.
- Single viewport on standard desktop/phone sizes; small or landscape screens and zoom may scroll vertically rather than clipping actions.

## Run

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Landing itself needs no credentials; use the existing `.env.local` instructions for authenticated routes.

```sh
npm run lint
npm run typecheck
npm run check:security
npm run build
npm run start -- -p 3100
```

The optional browser regression script requires Playwright and its Chromium browser, installed separately (no runtime dependency added):

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/landing-interactions.mjs
```

`LANDING_BASE_URL` overrides port 3100. `PLAYWRIGHT_MODULE` accepts an absolute module path. `CHROMIUM_EXECUTABLE` optionally supplies a locally installed Chromium. The test disables WebGL deliberately and covers tracking, drag/release, keyboard, pause, reduced motion, overflow, login links, touch drag, and no-JS navigation.

## Scope

Only homepage, its new scoped stylesheet/components, this guide, and browser regression script are changed. Existing academic routes, login logic, database, RPC, RLS, environment configuration, dependency manifest and lockfile are unchanged. The old landing stylesheet remains in the repo but is no longer imported by the homepage.
