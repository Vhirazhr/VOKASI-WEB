import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(
  ts.transpile(fs.readFileSync("components/landing/scene-motion.ts", "utf8"), {
    module: ts.ModuleKind.CommonJS,
  }),
  { exports },
);
const { scenePose } = exports,
  anchors = [0, 900, 1800, 2900, 3900];
for (const mobile of [false, true]) {
  assert.equal(scenePose(0, anchors, mobile).x, 0);
  assert.ok(scenePose(900, anchors, mobile).x < 0);
  assert.ok(
    scenePose(1800, anchors, mobile).opacity < 0.1,
    "Crest fades behind leaderboard",
  );
  assert.equal(
    scenePose(2900, anchors, mobile).opacity,
    1,
    "Crest returns beside features",
  );
  assert.ok(
    scenePose(3900, anchors, mobile).turn > Math.PI * 7,
    "Full turns during scroll",
  );
  for (let scroll = 0; scroll <= 4100; scroll++) {
    const p = scenePose(scroll, anchors, mobile),
      next = scenePose(scroll + 1, anchors, mobile);
    assert.ok(
      Math.abs(next.x - p.x) < 0.002 && Math.abs(next.turn - p.turn) < 0.02,
      "No discontinuities",
    );
    assert.ok(
      Math.abs(p.x) <= 0.3 &&
        p.scale > 0 &&
        p.opacity >= 0.069 &&
        p.opacity <= 1 &&
        p.water >= 0 &&
        p.water <= 1,
    );
  }
}
assert.equal(scenePose(-100, anchors, false).progress, 0);
assert.equal(scenePose(9999, anchors, false).progress, 1);
console.log(
  "PASS: complete rotations, leaderboard fade/reappearance, continuous desktop/mobile framing and bounds.",
);
const { finalSceneOffset } = exports;
assert.ok(finalSceneOffset(3800, 3900, 0) === 0);
assert.equal(finalSceneOffset(4100, 3900, 0), -200);
assert.equal(finalSceneOffset(4500, 3900, -200), -400);
// Stage displacement + local offset must match document scroll, even near footer.
for (const stageTop of [0, -100, -500]) {
  assert.equal(stageTop + finalSceneOffset(4500, 3900, stageTop), -600);
}
assert.ok(scenePose(2900, anchors, false).y < .55, 'Feature crest remains above the water');
console.log('PASS: final crest anchors to guide through sticky containment and footer boundary.');
