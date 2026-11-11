// Статистика кадров за последние секунды: средний FPS, «1 % худших кадров» и среднее время кадра.
// Нужна для проверки производительности (задача 10 брифа): клавиша F или адрес с ?stress.

export interface FrameSummary {
  /** Средний FPS за окно. */
  fps: number;
  /** FPS худшего 1 % кадров: показывает подёргивания, которые среднее прячет. */
  low: number;
  /** Среднее время кадра, мс. */
  ms: number;
  /** Сколько кадров в окне. */
  frames: number;
}

export class FrameStats {
  private readonly windowMs: number;
  private readonly deltas: number[] = [];
  private readonly times: number[] = [];

  constructor(windowMs = 10000) {
    this.windowMs = windowMs;
  }

  /** deltaMs — длительность кадра, now — время его конца. Паузы дольше секунды (вкладка была скрыта) не считаем. */
  add(deltaMs: number, now: number): void {
    if (!(deltaMs > 0) || deltaMs > 1000) return;
    this.deltas.push(deltaMs);
    this.times.push(now);
    while (this.times.length > 0 && now - this.times[0] > this.windowMs) {
      this.times.shift();
      this.deltas.shift();
    }
  }

  summary(): FrameSummary {
    const n = this.deltas.length;
    if (n === 0) return { fps: 0, low: 0, ms: 0, frames: 0 };
    const total = this.deltas.reduce((a, b) => a + b, 0);
    const sorted = [...this.deltas].sort((a, b) => b - a);
    const worst = sorted.slice(0, Math.max(1, Math.ceil(n * 0.01)));
    const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
    return { fps: (1000 * n) / total, low: 1000 / worstAvg, ms: total / n, frames: n };
  }
}
