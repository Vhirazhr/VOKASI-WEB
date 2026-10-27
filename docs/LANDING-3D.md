# Institutional VOKASI landing

## Run
Node >=20.9: `npm ci`, `npm run dev`, then http://localhost:3000.
Production: `npm run build` then `npm start`.
Retain existing local Supabase environment for real authentication and ranking. No new environment variables or keys. The additive public leaderboard migration is included and was applied to the connected VOKASI project on 26 October 2026.

## Current design
- Slim frosted-white navigation follows the supplied RESADEX reference: compact brand, closely spaced menus, white Beranda pill and dark Login button. Desktop width is capped at 960px; mobile retains two rows to keep every link accessible.
- Hero: supplied official crest, bold VOKASI lettering distributed evenly across a bounded wordmark, Platform Pembelajaran Numerasi. Individual decorative letter spans retain a single accessible VOKASI heading label. The subtitle is anchored near the lower edge of the hero with responsive clearance. Glass surfaces now use a low-opacity flat tint, fine border and backdrop blur, following the translucent reference. Decorative diagonal reflections and inset highlights are removed. The hero wordmark follows the supplied typography reference: Sora ExtraBold 800, up to 100px, blue gradient; subtitle Jakarta Bold 700 up to 18px with .08em tracking. Navbar uses title case, Jakarta Medium 500 up to 16px; VOKASI branding remains uppercase. Run npm install after pulling for the new font packages. No scroll-down label or animation button beneath navigation.
- Self-hosted Plus Jakarta Sans for body/navigation/form text and Sora ExtraBold for headings throughout the landing and login dialog, bold hero lettering, translucent navigation/login, and mint/lavender/champagne accents across glass surfaces. The hero crest is slightly larger/lower; the feature crest stays above the water and the final crest anchors to the guide before the footer. Institutional copy follows the requested text.
- Three.js extrusion follows the actual alpha outline of the supplied PNG. Thickness increases from .12 to .38, with beveled metal edges, physical enamel front/back, neutral specular lights and higher reflection intensity. The original image is not edited.
- Idle rotation completes approximately one revolution per 25 seconds. Each section transition adds a full turn; the logo fades behind the leaderboard and returns beside features/guide. Actual section offsets drive the sequence.
- The dynamic WebGL renderer caps DPR, stops offscreen/in hidden tabs, respects reduced motion, and disposes resources. An optional animation setting is inside the footer; WebGL failure leaves the image fallback and HTML controls.

## Login and ranking
`LandingAccess.tsx` uses a native dialog for modal focus containment/Escape support and the unchanged `currentRole` / `signIn` helpers from `lib/auth.ts`. Existing username/class disambiguation and admin authorization remain in that helper. No alternate auth endpoint, embedded iframe, credential storage or authorization bypass is introduced.

Login and Latihan redirect authenticated students/admins to their existing dashboard. A signed-out user gets the themed popup. The leaderboard now loads independently of login. Standard `/login?role=...` hrefs remain usable without JavaScript or in a new tab. Closing clears entered fields and invalidates stale UI responses; the auth helper itself is unchanged.

The public `vokasi_public_leaderboard()` RPC supplies at most 10 entries: three featured cards in visual order 2–1–3, followed by positions 4–10. It exposes only rank, abbreviated display name, class and score. A security-invoker public wrapper calls a bounded security-definer function in a non-exposed schema; no table grants, existing RPCs or RLS policies change.

The metric remains **highest verified mandatory average**, not XP and not maximum individual attempt: latest mandatory attempt per Jakarta day in the current quarter, averaged/rounded just like the existing dashboard. Score ties use completed days then Indonesian alphabetical name order, with an internal stable tie-breaker. The public query has no dashboard 2,500-row cap, so it remains school-wide. No identity IDs, usernames, emails or answer details are returned. Refresh is every 20 seconds while visible, plus focus/visibility return; this is polling, not a real-time subscription. Unmount aborts outstanding requests.

Live anonymous-role query succeeded. A read-only comparison with the existing dashboard returned zero mismatches, but **both currently have zero qualifying compulsory-score rows** (one verified attempt exists). Consequently, the actual non-empty production ranking has not been observed; the UI shows an honest empty state. No student rows were inserted or changed. Security advisor findings are unchanged from before this migration. A separate read-only SQL fixture check of the same query returned 98 above 60, selected the latest daily attempt instead of an earlier 100, and excluded the bonus attempt; fixtures were CTE values, never inserted into student tables.

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
- `node tests/landing-scene-motion.mjs`: complete rotations, fade/reappearance, continuous bounded framing, and guide/footer anchoring including sticky displacement.
- `tests/landing-access.mjs`: previous revision component tests with mocked auth passed student/admin routing, existing sessions, inline leaderboard login, errors, field clearing, body scroll restoration and close-during-submit. Run with a separate React test runtime matching the app: `npm install --prefix /tmp/landing-tests react@19.3.1 react-test-renderer@19.3.1`, then `LANDING_TEST_RUNTIME=/tmp/landing-tests node tests/landing-access.mjs`. These dependencies are not added to production; react-test-renderer is deprecated and this test does not replace browser QA.
- Browser/visual QA remains unverified: `sites-preview start` appends unsupported Vite `--host` flags to Next dev. No claim of pixel-matching, WebGL performance or real-account login testing is made. The updated optional Playwright suite (`tests/landing-interactions.mjs`) is NOT executed here. Run against a local server with `LANDING_BASE_URL=http://localhost:3000`; repeat with `DISABLE_WEBGL=1`. Inspect focus trapping, mobile layouts, real WebGL shading and authorized login with school test accounts before merging.

Changes from current main, including the updated admin dashboard, are preserved.
