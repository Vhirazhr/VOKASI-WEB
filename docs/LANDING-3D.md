# Institutional VOKASI landing

## Run
Node >=20.9: `npm ci`, `npm run dev`, then http://localhost:3000.
Production: `npm run build` then `npm start`.
Retain existing local Supabase environment for real authentication and ranking. No new environment variables, keys or database changes.

## Current design
- Compact glass navigation: Beranda, Tentang, Leaderboard, Fitur Unggulan, Login.
- Hero: supplied official crest, centered VOKASI, Platform Pembelajaran Numerasi. No scroll-down label or animation button beneath navigation.
- Saturated blue water and matching glass surfaces throughout About, leaderboard, features, four-step guide and footer. Institutional copy follows the requested text.
- Three.js extrusion follows the actual alpha outline of the supplied PNG. Thickness increases from .12 to .38, with beveled metal edges, physical enamel front/back, neutral specular lights and higher reflection intensity. The original image is not edited.
- Idle rotation completes approximately one revolution per 25 seconds. Each section transition adds a full turn; the logo fades behind the leaderboard and returns beside features/guide. Actual section offsets drive the sequence.
- The dynamic WebGL renderer caps DPR, stops offscreen/in hidden tabs, respects reduced motion, and disposes resources. An optional animation setting is inside the footer; WebGL failure leaves the image fallback and HTML controls.

## Login and ranking
`LandingAccess.tsx` uses a native dialog for modal focus containment/Escape support and the unchanged `currentRole` / `signIn` helpers from `lib/auth.ts`. Existing username/class disambiguation and admin authorization remain in that helper. No alternate auth endpoint, embedded iframe, credential storage or authorization bypass is introduced.

Login and Latihan redirect authenticated students/admins to their existing dashboard. A signed-out user gets the themed popup. Login initiated from the leaderboard stays on the landing after a successful student login so ranking can load there. Standard `/login?role=...` hrefs remain usable without JavaScript or in a new tab. Closing clears entered fields and invalidates stale UI responses; the auth helper itself is unchanged.

The existing `getLeaderboard()` supplies up to 10 entries: three featured cards in visual order 2–1–3, followed by positions 4–10 when available. The metric remains **highest verified mandatory average**, not XP and not maximum individual attempt. Backend authorization currently requires a registered student; signed-out visitors see an explicit login prompt, no fabricated names/scores. Public student data access is NOT enabled. School data, RPC, RLS, scores, timer, quizzes and standalone login are unchanged.

## Footer contact source
Verified 26 October 2026 from Kemendikdasmen's school directory:
https://referensi.data.kemendikdasmen.go.id/pendidikan/npsn/20517766
- Jl. Raya Mondoroko No. 3, Banjararum, Singosari, Kabupaten Malang, Jawa Timur.
- smkn1sgsmalang@gmail.com
- (0341) 458138
- Official school website: https://smkn1singosari.sch.id/

## Verification
- `npm run typecheck`: passed.
- `npm run lint`: no errors; 10 existing warnings outside landing.
- `npm run build`: passed, 17 routes.
- `npm run check:security`: passed static code/migration contract; not a live database audit.
- `node tests/landing-ranking.mjs`: mocked adapter confirms score order, XP ignored, missing/unverified excluded and errors handled.
- `node tests/landing-scene-motion.mjs`: complete rotations, fade/reappearance, continuous bounded framing for desktop/mobile.
- `tests/landing-access.mjs`: component tests with mocked auth pass student/admin routing, existing sessions, inline leaderboard login, errors, field clearing, body scroll restoration and close-during-submit. Run with a separate React test runtime matching the app: `npm install --prefix /tmp/landing-tests react@19.3.1 react-test-renderer@19.3.1`, then `LANDING_TEST_RUNTIME=/tmp/landing-tests node tests/landing-access.mjs`. These dependencies are not added to production; react-test-renderer is deprecated and this test does not replace browser QA.
- Browser/visual QA remains unverified: `sites-preview start` appends unsupported Vite `--host` flags to Next dev. No claim of pixel-matching, WebGL performance or real-account login testing is made. The updated optional Playwright suite (`tests/landing-interactions.mjs`) is NOT executed here. Run against a local server with `LANDING_BASE_URL=http://localhost:3000`; repeat with `DISABLE_WEBGL=1`. Inspect focus trapping, mobile layouts, real WebGL shading and authorized login with school test accounts before merging.

Changes from current main, including the updated admin dashboard, are preserved.
