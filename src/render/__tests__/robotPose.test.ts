import { describe, expect, it } from 'vitest';
import { laneOffset, robotPose } from '../robotPose';

describe('место робота в клетке', () => {
  it('у доков разные полосы, но не дальше трети клетки', () => {
    const offsets = [0, 1, 2, 3].map(laneOffset);
    expect(new Set(offsets).size).toBe(4);
    for (let dock = 0; dock < 8; dock++) {
      expect(laneOffset(dock)).toBeGreaterThan(0.05);
      expect(laneOffset(dock)).toBeLessThan(0.34);
    }
  });

  it('робот держится правой стороны по ходу движения', () => {
    const off = laneOffset(0);
    expect(robotPose({ x: 3, y: 4, dir: 1, dock: 0 }, false)).toEqual({ x: 3, y: 4 + off });
    expect(robotPose({ x: 3, y: 4, dir: 3, dock: 0 }, false)).toEqual({ x: 3, y: 4 - off });
    expect(robotPose({ x: 3, y: 4, dir: 0, dock: 0 }, false)).toEqual({ x: 3 + off, y: 4 });
    expect(robotPose({ x: 3, y: 4, dir: 2, dock: 0 }, false)).toEqual({ x: 3 - off, y: 4 });
  });

  it('на стоянке робот стоит ровно по центру дока', () => {
    expect(robotPose({ x: 7, y: 4, dir: 2, dock: 1 }, true)).toEqual({ x: 7, y: 4 });
  });
});
