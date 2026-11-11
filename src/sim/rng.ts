/**
 * Детерминированный генератор случайных чисел (алгоритм mulberry32).
 *
 * Зачем свой, а не Math.random():
 *  - одно и то же зерно даёт одну и ту же последовательность → уровень идёт одинаково, тесты стабильны;
 *  - всё состояние — одно число, поэтому его легко скопировать (репетиция) и сохранить.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Случайное число в диапазоне [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Целое число от min до max включительно. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  clone(): Rng {
    return new Rng(this.state);
  }
}
