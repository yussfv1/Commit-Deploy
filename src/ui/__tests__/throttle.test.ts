import { describe, expect, it } from 'vitest';
import { Throttle } from '../throttle';

describe('ограничитель частоты звуков', () => {
  it('пропускает первый звук и глушит повтор раньше паузы', () => {
    const t = new Throttle({ step: 40 });
    expect(t.allow('step', 1000)).toBe(true);
    expect(t.allow('step', 1020)).toBe(false);
    expect(t.allow('step', 1040)).toBe(true);
  });

  it('у каждого звука свой счёт', () => {
    const t = new Throttle({ step: 40, miss: 80 });
    expect(t.allow('step', 0)).toBe(true);
    expect(t.allow('miss', 10)).toBe(true);
    expect(t.allow('miss', 60)).toBe(false);
  });

  it('звук без своей паузы берёт общую', () => {
    const t = new Throttle({}, 25);
    expect(t.allow('click', 0)).toBe(true);
    expect(t.allow('click', 10)).toBe(false);
    expect(t.allow('click', 25)).toBe(true);
  });

  it('при 128 шагах в секунду остаётся не больше 25 звуков', () => {
    const t = new Throttle({ step: 40 });
    let played = 0;
    for (let i = 0; i < 128; i++) if (t.allow('step', (i * 1000) / 128)) played++;
    expect(played).toBeLessThanOrEqual(25);
    expect(played).toBeGreaterThan(15);
  });
});
