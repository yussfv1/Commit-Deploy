// Страховка для слабых компьютеров: если кадры долго идут медленнее ~45 FPS, холст рисуется
// в меньшем разрешении (шаг 0,25, не ниже 1280×720). Обратно не повышаем — чтобы картинка не прыгала.

export interface GovernorOptions {
  /** Среднее время кадра, после которого кадры считаются медленными, мс. */
  slowMs: number;
  /** Сколько медленные кадры должны продержаться подряд, мс. */
  holdMs: number;
  /** На сколько понижать масштаб за раз. */
  step: number;
  /** Ниже этого масштаба не опускаемся (1 — ровно 1280×720). */
  floor: number;
  /** Первые мс после запуска не судим: идёт загрузка. */
  warmupMs: number;
}

const DEFAULTS: GovernorOptions = { slowMs: 22, holdMs: 2000, step: 0.25, floor: 1, warmupMs: 3000 };
const TARGET_MS = 1000 / 60;

export class FrameGovernor {
  private readonly o: GovernorOptions;
  private avg = TARGET_MS;
  private slowSince = -1;
  private startedAt = -1;

  constructor(options: Partial<GovernorOptions> = {}) {
    this.o = { ...DEFAULTS, ...options };
  }

  /**
   * Учесть кадр. deltaMs — его длительность, now — время, scale — текущий масштаб холста.
   * Возвращает новый потолок масштаба, если пора понизить чёткость, иначе null.
   */
  sample(deltaMs: number, now: number, scale: number): number | null {
    if (this.startedAt < 0) this.startedAt = now;
    // Скрытая вкладка или разовая заминка — не повод менять чёткость.
    if (!(deltaMs > 0) || deltaMs > 250 || now - this.startedAt < this.o.warmupMs) return null;
    this.avg += (deltaMs - this.avg) * 0.1;
    if (this.avg <= this.o.slowMs) {
      this.slowSince = -1;
      return null;
    }
    if (this.slowSince < 0) {
      this.slowSince = now;
      return null;
    }
    if (now - this.slowSince < this.o.holdMs || scale <= this.o.floor + 1e-9) return null;
    this.slowSince = -1;
    this.avg = TARGET_MS;
    return Math.max(this.o.floor, Math.round((scale - this.o.step) * 20) / 20);
  }
}
