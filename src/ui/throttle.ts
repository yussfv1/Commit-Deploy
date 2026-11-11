// Ограничитель частоты: один и тот же звук не играет чаще, чем раз в заданную паузу.
// Без него 8 роботов на скорости ×4 дают больше ста бипов шага в секунду.

export class Throttle {
  private readonly last = new Map<string, number>();
  private readonly gaps: Readonly<Record<string, number>>;
  private readonly fallback: number;

  constructor(gaps: Readonly<Record<string, number>>, fallback = 0) {
    this.gaps = gaps;
    this.fallback = fallback;
  }

  /** true — звук можно играть сейчас (и момент запоминается). nowMs — время в миллисекундах. */
  allow(name: string, nowMs: number): boolean {
    const gap = this.gaps[name] ?? this.fallback;
    const prev = this.last.get(name);
    if (prev !== undefined && nowMs - prev < gap) return false;
    this.last.set(name, nowMs);
    return true;
  }
}
