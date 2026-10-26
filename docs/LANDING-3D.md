# VOKASI water / crest landing

## Run

Node >=20.9: `npm ci`, then `npm run dev`. Open http://localhost:3000.
Production: `npm run build` then `npm start`.
Keep the existing local Supabase environment for authenticated features. No new credentials or configuration are required by the scene.

## Implementation

- `app/page.tsx` and `app/landing-3d.css`: full-viewport hero, alternating full-viewport introduction and score ranking, centered closing CTA, FAQ and footer. All styles are scoped.
- `components/landing/LogoScene.tsx`: lazily loaded Three.js WebGL renderer; actual extruded geometry traced from the supplied logo alpha boundary, original-color textured front/back, metallic sidewalls and clearcoat lighting. A displaced water mesh with normal-based reflection shading gives soft blue ripples; renderer tone mapping and color-space conversion are applied consistently. No external model/HDR downloads or React Three Fiber/Drei dependencies.
- Scroll advances the logo from hero center to the left of the introduction, right of ranking, then center of the closing CTA, with gentle alternating turns; idle motion gently bounces and rocks. No cursor tracking is required in this revision. The crest is not recolored or replaced by a sphere.
- `public/assets/vokasi-school-logo-hd.png`: exact attached PNG, unedited. The original `/assets/smkn1sgs-166x166-1.png` remains untouched for existing login usage. Change `components/landing/identity.ts` to use another official asset.
- DPR capped at 1.25 on phones / 1.75 elsewhere. Rendering stops outside the viewport, when the tab is hidden, when paused, and after a reduced-motion frame. Resize/scroll events render on demand. Resources, event listeners and observers are disposed on unmount.
- WebGL failure or context loss falls back to the school image. Navigation, content and FAQ are HTML. Reduced motion disables idle animation and scroll rotation (position still follows scroll). Pause stops time-based animation; scroll remains usable.

## Ranking and factual content

The existing `getLeaderboard()` adapter is reused without modifying RPC, RLS, grading, timer, XP or database configuration. Ranking is descending **verified mandatory average**, not XP and not best individual attempt. Signed-out visitors see a sign-in prompt and no student names/scores. No fake leader data, contact details or testimonials are included. FAQ describes existing app capabilities only.

## Verification for this revision

- `npm run typecheck`: passed.
- `npm run lint`: passed, 10 pre-existing warnings outside landing code.
- `npm run check:security`: passed static contract checks; not a live database audit.
- `node tests/landing-ranking.mjs`: passed mocked ranking adapter checks (high average outranks high XP; missing/unverified excluded).
- `npm run build`: passed, all 17 routes.
- `node tests/landing-scene-motion.mjs`: passed bounds, continuous transitions and center-left-right-center endpoints on desktop/mobile.
- Browser/visual QA: NOT verified in this environment. Managed preview appends Vite flags (`--host`, `--strictPort`) to Next dev, which rejects `--host`. No visual/performance claim is made from build results.
- `tests/landing-interactions.mjs` is updated for this design but NOT run here. With Playwright installed separately and a local server running, use `LANDING_BASE_URL=http://localhost:3000 node tests/landing-interactions.mjs`; repeat with `DISABLE_WEBGL=1` for fallback. Manually inspect desktop/mobile, scroll transition, texture fidelity, contrast, pause, reduced motion and FAQ before merging.

Existing main updates (including login glass styling) are retained. No academic/auth implementation is edited by this landing change.

## Composition revision
Lower camera angle (1.9 / 10), smaller crest, centered VOKASI heading with balanced tracking, muted lighting and a shared blue palette follow the supplied visual reference. Scroll keyframes use actual section offsets instead of a two-section hardcoded timeline; horizontal placement scales with the camera aspect ratio. On phones the crest occupies a reserved upper area while the content stays below. Live browser comparison to the reference remains unverified due to the preview limitation above.
