// Сохранение уровня и перезапуск линии — то, что переживает сцену.
//   «Продолжить»: незаконченный уровень сохраняется (каждые 5 секунд, на паузе, когда вкладку прячут или закрывают)
//                 и загружается из выбора уровней — после перезагрузки страницы игра на том же месте.
//   «Заново с роботами»: в момент «Старт» запоминаем мир; перезапуск берёт его и раздаёт роботам текущие программы.
// Оба держатся на сохранении симуляции (ISimulation.serialize / deserialize) — симуляцию для этого не меняли.
import type Phaser from 'phaser';
import type { ISimulation, LevelData } from '../types';
import { t } from './i18n';
import { machineDefs } from './levels';
import { applyReplay, captureReplay } from './replay';
import type { Replay } from './replay';
import { store } from './storage';

export interface RunStart {
  /** «Заново с роботами»: мир с момента «Старт» и программы роботов. */
  replay?: Replay | null;
  /** «Продолжить»: загрузить автосохранение этого уровня. */
  resume?: boolean;
}

export interface Note {
  text: string;
  kind: 'ok' | 'warn' | 'info';
}

export class RunKeeper {
  /** Мир в момент «Старт» — с него начинается «Заново с роботами». */
  startSave: string | null = null;
  private readonly sim: ISimulation;
  private readonly level: LevelData;
  /** Проверка производительности и демо питча не сохраняются и не трогают сохранение игрока. */
  private readonly special: boolean;

  constructor(sim: ISimulation, level: LevelData, special: boolean) {
    this.sim = sim;
    this.level = level;
    this.special = special;
  }

  /**
   * Вход в уровень. «Заново с роботами» и «Продолжить» загружают мир; обычный вход стирает сохранение
   * этого же уровня — игрок выбрал начать сначала. Возвращает сообщение для игрока или null.
   */
  restore(data: RunStart | undefined): Note | null {
    if (this.special) return null;
    if (data?.replay) {
      try {
        const r = applyReplay(this.sim, data.replay);
        this.startSave = data.replay.save;
        return r.failed > 0 ? { text: t('replay.partial', { n: r.failed }), kind: 'warn' } : { text: t('replay.done'), kind: 'ok' };
      } catch (err) {
        console.warn('Заново с роботами: сохранение не читается, уровень начат с нуля', err);
        this.reload();
        return null;
      }
    }
    const run = store.run();
    if (!data?.resume) {
      if (run?.levelId === this.level.id) store.clearRun();
      return null;
    }
    if (!run || run.levelId !== this.level.id) return null;
    try {
      this.sim.deserialize(run.save);
      this.startSave = run.startSave;
      return { text: t('run.resumed'), kind: 'info' };
    } catch (err) {
      console.warn('Продолжить: сохранение не читается, уровень начат с нуля', err);
      store.clearRun();
      this.reload();
      return null;
    }
  }

  /** «Старт»: запомнить мир, с которого начнётся «Заново с роботами». */
  markStart(): void {
    this.startSave = this.sim.serialize();
  }

  /** Линия для «Заново с роботами» (null — линию ещё не запускали). */
  replay(): Replay | null {
    return captureReplay(this.startSave, this.sim.snapshot());
  }

  /** Сохранить незаконченный уровень. ended — уровень уже закончился (идёт финал или итоги). */
  save(ended: boolean): void {
    if (this.special || ended) return;
    const s = this.sim.snapshot();
    if (s.mode === 'won' || s.mode === 'lost') return;
    // Пустой план (роботов ещё нет) сохранять незачем: начать его заново — то же самое.
    if (s.robots.length === 0 && s.mode !== 'teach') return;
    store.saveRun({ levelId: this.level.id, save: this.sim.serialize(), startSave: this.startSave, at: Date.now() });
  }

  /** Уровень закончен (итоги) — его сохранение больше не нужно. */
  finish(): void {
    if (!this.special) store.clearRun();
  }

  /** Вкладку спрятали или закрыли — сохранить. Слушатели снимаются, когда сцена уходит. */
  attach(scene: Phaser.Scene, ended: () => boolean): void {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') this.save(ended());
    };
    const onPageHide = (): void => this.save(ended());
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    scene.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    });
  }

  private reload(): void {
    this.sim.loadLevel(this.level, machineDefs());
  }
}
