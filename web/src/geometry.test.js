import { test, expect } from 'vitest';
import { cmToPx, pxToCm, snapCm, rotatedFootprint, nextRotation, PX_PER_CM, wallSegment, doorArcPath, nearestWallPoint, clampFeatureOffset, snapRoomPosition } from './geometry.js';

test('cmToPx / pxToCm are inverse', () => {
  expect(cmToPx(100)).toBe(100 * PX_PER_CM);
  expect(pxToCm(cmToPx(250))).toBeCloseTo(250);
});

test('snapCm snaps to 10cm grid', () => {
  expect(snapCm(13)).toBe(10);
  expect(snapCm(16)).toBe(20);
  expect(snapCm(-14)).toBe(-10);
});

test('rotatedFootprint swaps w/h for 90 and 270', () => {
  expect(rotatedFootprint(90, 60, 0)).toEqual({ w: 90, h: 60 });
  expect(rotatedFootprint(90, 60, 90)).toEqual({ w: 60, h: 90 });
  expect(rotatedFootprint(90, 60, 180)).toEqual({ w: 90, h: 60 });
  expect(rotatedFootprint(90, 60, 270)).toEqual({ w: 60, h: 90 });
});

test('nextRotation cycles through 90-degree steps', () => {
  expect(nextRotation(0)).toBe(90);
  expect(nextRotation(270)).toBe(0);
  expect(nextRotation(undefined)).toBe(90);
});

const ROOM = { x: 100, y: 50, width_cm: 400, depth_cm: 300 };

test('wallSegment: N/S walls run from the west corner', () => {
  expect(wallSegment(ROOM, 'N', 90, 180)).toEqual({ x1: 190, y1: 50, x2: 370, y2: 50 });
  expect(wallSegment(ROOM, 'S', 0, 80)).toEqual({ x1: 100, y1: 350, x2: 180, y2: 350 });
});

test('wallSegment: E/W walls run from the north corner; len 0 is a point', () => {
  expect(wallSegment(ROOM, 'W', 10, 20)).toEqual({ x1: 100, y1: 60, x2: 100, y2: 80 });
  expect(wallSegment(ROOM, 'E', 150, 0)).toEqual({ x1: 500, y1: 200, x2: 500, y2: 200 });
});

test('doorArcPath: in-left door on the S wall sweeps into the room', () => {
  const room = { x: 0, y: 0, width_cm: 400, depth_cm: 300 };
  const f = { kind: 'door', wall: 'S', offset_cm: 100, width_cm: 80, swing: 'in-left' };
  // hinge (100,300), free (180,300), inward (-y) -> end (100,220); px = cm * 0.6
  expect(doorArcPath(room, f)).toBe('M 108 180 A 48 48 0 0 0 60 132 L 60 180');
});

test('doorArcPath: out-right flips both hinge and direction', () => {
  const room = { x: 0, y: 0, width_cm: 400, depth_cm: 300 };
  const f = { kind: 'door', wall: 'S', offset_cm: 100, width_cm: 80, swing: 'out-right' };
  // hinge (180,300), free (100,300), outward (+y) -> end (180,380)
  expect(doorArcPath(room, f)).toBe('M 60 180 A 48 48 0 0 0 108 228 L 108 180');
});

const NEAR_ROOM = { id: 1, x: 100, y: 50, width_cm: 400, depth_cm: 300 };

test('nearestWallPoint projects the cursor onto the closest wall', () => {
  expect(nearestWallPoint([NEAR_ROOM], 250, 60)).toEqual({ roomId: 1, wall: 'N', offsetCm: 150 });
  expect(nearestWallPoint([NEAR_ROOM], 110, 200)).toEqual({ roomId: 1, wall: 'W', offsetCm: 150 });
  expect(nearestWallPoint([NEAR_ROOM], 495, 200)).toEqual({ roomId: 1, wall: 'E', offsetCm: 150 });
  expect(nearestWallPoint([NEAR_ROOM], 250, 340)).toEqual({ roomId: 1, wall: 'S', offsetCm: 150 });
});

test('nearestWallPoint returns null beyond the threshold or outside the wall extent', () => {
  expect(nearestWallPoint([NEAR_ROOM], 250, 200, 30)).toBeNull(); // room center
  expect(nearestWallPoint([NEAR_ROOM], 250, 10, 30)).toBeNull();  // 40cm above N wall
  expect(nearestWallPoint([NEAR_ROOM], 600, 60, 30)).toBeNull();  // past the NE corner
  expect(nearestWallPoint([NEAR_ROOM], 250, 80, 30)).toEqual({ roomId: 1, wall: 'N', offsetCm: 150 }); // exactly 30cm
});

test('nearestWallPoint picks the closest wall across multiple rooms', () => {
  const other = { id: 2, x: 600, y: 50, width_cm: 200, depth_cm: 200 };
  expect(nearestWallPoint([NEAR_ROOM, other], 610, 150)).toEqual({ roomId: 2, wall: 'W', offsetCm: 100 });
});

test('clampFeatureOffset keeps the feature inside its wall', () => {
  const room = { width_cm: 400, depth_cm: 300 };
  expect(clampFeatureOffset(room, 'N', -10, 80)).toBe(0);
  expect(clampFeatureOffset(room, 'N', 350, 80)).toBe(320);
  expect(clampFeatureOffset(room, 'E', 280, 0)).toBe(280);
  expect(clampFeatureOffset(room, 'E', 310, 0)).toBe(300);
});

const ME = { id: 1, x: 0, y: 0, width_cm: 200, depth_cm: 200 };
const NEIGHBOR = { id: 2, x: 300, y: 0, width_cm: 400, depth_cm: 300 };

test('snapRoomPosition: right edge sticks flush to a neighbor left wall within 15cm', () => {
  const r = snapRoomPosition(ME, [NEIGHBOR], 92, 40); // my right edge 292 vs their left 300
  expect(r.x).toBe(100);
  expect(r.snappedX).toBe(true);
  expect(r.y).toBe(40);
  expect(r.snappedY).toBe(false);
  expect(r.guides).toEqual([{ axis: 'x', positionCm: 300, fromCm: 0, toCm: 300 }]);
});

test('snapRoomPosition: corners align on the perpendicular axis', () => {
  const r = snapRoomPosition(ME, [NEIGHBOR], 100, 12); // x flush + top edges 12cm apart
  expect(r.x).toBe(100);
  expect(r.y).toBe(0);
  expect(r.snappedY).toBe(true);
  expect(r.guides).toHaveLength(2);
});

test('snapRoomPosition: no snap beyond the threshold', () => {
  const r = snapRoomPosition(ME, [NEIGHBOR], 60, 40);
  expect(r).toMatchObject({ x: 60, y: 40, snappedX: false, snappedY: false, guides: [] });
});

test('snapRoomPosition: far-away rooms on the perpendicular axis do not grab', () => {
  const r = snapRoomPosition(ME, [NEIGHBOR], 92, 340); // y ranges 340~540 vs 0~300, gap > 15
  expect(r.snappedX).toBe(false);
  expect(r.x).toBe(92);
});
