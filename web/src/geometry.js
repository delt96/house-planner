export const PX_PER_CM = 0.6;
export const GRID_CM = 10;

export const cmToPx = (cm) => cm * PX_PER_CM;
export const pxToCm = (px) => px / PX_PER_CM;
export const snapCm = (cm, grid = GRID_CM) => Math.round(cm / grid) * grid;

export function rotatedFootprint(width_cm, depth_cm, rotation) {
  const r = ((rotation % 360) + 360) % 360;
  return r === 90 || r === 270 ? { w: depth_cm, h: width_cm } : { w: width_cm, h: depth_cm };
}

export const nextRotation = (rotation) => (((rotation ?? 0) + 90) % 360);

// ---- Wall-anchor (room attachment) geometry ----
// Offset zero-point convention — N/S walls: west (left) corner, E/W walls: north (top) corner.

// Segment of length len on a wall, starting at offset (cm, canvas coordinates). len 0 is a point (e.g. outlet).
export function wallSegment(room, wall, offsetCm, lenCm = 0) {
  const x = Number(room.x), y = Number(room.y);
  const w = Number(room.width_cm), d = Number(room.depth_cm);
  switch (wall) {
    case 'N': return { x1: x + offsetCm, y1: y, x2: x + offsetCm + lenCm, y2: y };
    case 'S': return { x1: x + offsetCm, y1: y + d, x2: x + offsetCm + lenCm, y2: y + d };
    case 'W': return { x1: x, y1: y + offsetCm, x2: x, y2: y + offsetCm + lenCm };
    case 'E': return { x1: x + w, y1: y + offsetCm, x2: x + w, y2: y + offsetCm + lenCm };
    default: return null;
  }
}

const INWARD = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };

// SVG path (px) for the door-swing symbol (arc + door leaf). The swing's left/right refers to
// which end of the wall segment (at the offset-0 side vs the other end) is the hinge; in/out is
// whether it swings into or out of the room.
export function doorArcPath(room, f) {
  const seg = wallSegment(room, f.wall, f.offset_cm, f.width_cm);
  const swing = f.swing ?? 'in-left';
  const hingeAtStart = swing.endsWith('left');
  const h = hingeAtStart ? [seg.x1, seg.y1] : [seg.x2, seg.y2];
  const free = hingeAtStart ? [seg.x2, seg.y2] : [seg.x1, seg.y1];
  const dir = swing.startsWith('out') ? -1 : 1;
  const [nx, ny] = INWARD[f.wall];
  const end = [h[0] + nx * dir * f.width_cm, h[1] + ny * dir * f.width_cm];
  // Rotation direction (SVG sweep flag) from free to end, determined by the sign of the cross product.
  const cross = (free[0] - h[0]) * (end[1] - h[1]) - (free[1] - h[1]) * (end[0] - h[0]);
  const sweep = cross > 0 ? 1 : 0;
  const r = cmToPx(f.width_cm);
  return `M ${cmToPx(free[0])} ${cmToPx(free[1])} A ${r} ${r} 0 0 ${sweep} ${cmToPx(end[0])} ${cmToPx(end[1])} L ${cmToPx(h[0])} ${cmToPx(h[1])}`;
}

// Project a cursor point (cm, canvas coords) onto the nearest wall among rooms.
// Only walls whose parallel extent contains the cursor count; returns null when
// every wall is farther than thresholdCm (perpendicular distance).
export function nearestWallPoint(rooms, cmX, cmY, thresholdCm = 30) {
  let best = null;
  for (const room of rooms) {
    const x = Number(room.x), y = Number(room.y);
    const w = Number(room.width_cm), d = Number(room.depth_cm);
    const candidates = [
      { wall: 'N', dist: Math.abs(cmY - y), offset: cmX - x, inRange: cmX >= x && cmX <= x + w },
      { wall: 'S', dist: Math.abs(cmY - (y + d)), offset: cmX - x, inRange: cmX >= x && cmX <= x + w },
      { wall: 'W', dist: Math.abs(cmX - x), offset: cmY - y, inRange: cmY >= y && cmY <= y + d },
      { wall: 'E', dist: Math.abs(cmX - (x + w)), offset: cmY - y, inRange: cmY >= y && cmY <= y + d },
    ];
    for (const c of candidates) {
      if (!c.inRange || c.dist > thresholdCm) continue;
      if (!best || c.dist < best.dist) best = { roomId: room.id, wall: c.wall, offsetCm: c.offset, dist: c.dist };
    }
  }
  return best ? { roomId: best.roomId, wall: best.wall, offsetCm: best.offsetCm } : null;
}

// Clamp a feature of widthCm so it stays fully on the wall: [0, wallLen - widthCm].
export function clampFeatureOffset(room, wall, offsetCm, widthCm = 0) {
  const wallLen = wall === 'N' || wall === 'S' ? Number(room.width_cm) : Number(room.depth_cm);
  return Math.min(Math.max(offsetCm, 0), Math.max(wallLen - widthCm, 0));
}
