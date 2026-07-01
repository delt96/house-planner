import { test, expect } from 'vitest';
import { cmToPx, pxToCm, snapCm, rotatedFootprint, nextRotation, PX_PER_CM } from './geometry.js';

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
