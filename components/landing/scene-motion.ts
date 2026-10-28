/** Normalized coordinates: hero, about, leaderboard, features, guide. */
export function scenePose(
  scroll: number,
  anchors: readonly number[],
  mobile: boolean,
) {
  const tau = Math.PI * 2;
  const stops = mobile
    ? [
        { x: 0, y: 0.38, scale: 0.52, turn: -0.2, opacity: 1 },
        { x: -0.12, y: 0.19, scale: 0.39, turn: tau - 0.2, opacity: 1 },
        { x: 0, y: 0.35, scale: 0.28, turn: tau * 2, opacity: 0.07 },
        { x: 0.23, y: 0.32, scale: 0.36, turn: tau * 3 + 0.2, opacity: 1 },
        { x: 0.14, y: 0.19, scale: 0.38, turn: tau * 4, opacity: 1 },
      ]
    : [
        { x: 0, y: 0.38, scale: 0.70, turn: -0.2, opacity: 1 },
        { x: -0.255, y: 0.48, scale: 0.72, turn: tau - 0.2, opacity: 1 },
        { x: 0, y: 0.4, scale: 0.44, turn: tau * 2, opacity: 0.07 },
        { x: -0.25, y: 0.48, scale: 0.64, turn: tau * 3 + 0.2, opacity: 1 },
        { x: 0.25, y: 0.27, scale: 0.52, turn: tau * 4, opacity: 1 },
      ];
  let index = 0;
  while (index < stops.length - 2 && scroll >= anchors[index + 1]) index++;
  const t = Math.max(
    0,
    Math.min(
      1,
      (scroll - anchors[index]) /
        Math.max(1, anchors[index + 1] - anchors[index]),
    ),
  );
  const ease = t * t * (3 - 2 * t),
    from = stops[index],
    to = stops[index + 1];
  const mix = (a: number, b: number) => a + (b - a) * ease;
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    scale: mix(from.scale, to.scale),
    turn: mix(from.turn, to.turn),
    opacity: mix(from.opacity, to.opacity),
    water: 1 - Math.min(1, index + ease) * 0.85,
    progress: (index + t) / 4,
  };
}

/** Compensate sticky containment so the final crest stays anchored to the guide. */
export function finalSceneOffset(scroll: number, lastAnchor: number, stageTop: number) {
  return -Math.max(0, scroll - lastAnchor) - Math.min(0, stageTop);
}
