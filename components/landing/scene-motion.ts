/** Normalized layout coordinates keep the crest within the viewport at every aspect ratio. */
export function scenePose(scroll: number, anchors: readonly number[], mobile: boolean) {
  const stops = mobile
    ? [{x:0,y:.34,scale:.57,turn:-.16},{x:-.15,y:.20,scale:.43,turn:.20},{x:.15,y:.19,scale:.40,turn:-.24},{x:0,y:.29,scale:.48,turn:0}]
    : [{x:0,y:.36,scale:.78,turn:-.16},{x:-.245,y:.49,scale:.76,turn:.24},{x:.255,y:.46,scale:.73,turn:-.28},{x:0,y:.32,scale:.64,turn:0}];
  let index = 0;
  while (index < stops.length - 2 && scroll >= anchors[index + 1]) index++;
  const t = Math.max(0, Math.min(1, (scroll - anchors[index]) / Math.max(1, anchors[index + 1] - anchors[index])));
  const ease = t * t * (3 - 2 * t);
  const from = stops[index], to = stops[index + 1];
  const mix = (a: number,b: number) => a + (b - a) * ease;
  return {x:mix(from.x,to.x),y:mix(from.y,to.y),scale:mix(from.scale,to.scale),turn:mix(from.turn,to.turn),water:1-Math.min(1,index+ease),progress:(index+t)/3};
}
