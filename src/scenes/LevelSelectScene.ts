// Выбор уровня — линия метро: уровни стоят станциями, пройденный участок линии светлый.
// Под линией — паспорт выбранного уровня: цель, время, энергия, что доступно, лучший результат.
import Phaser from 'phaser';
import { H, W } from '../render/layout';
import { iconKey } from '../render/textures';
import { audio } from '../ui/audio';
import { clock, i18n, t } from '../ui/i18n';
import { levels } from '../ui/levels';
import { store } from '../ui/storage';
import { COLOR, SIZE } from '../ui/theme';
import { Button, rule, setColor, setText, txt } from '../ui/widgets';
import type { LevelData } from '../types';
import { enter, go, leaving } from './flow';

const X0 = 88;
const LINE_Y = 232;
const R = 14;

interface Station {
  x: number;
  dot: Phaser.GameObjects.Arc;
  num: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  title: Phaser.GameObjects.Text;
}

export class LevelSelectScene extends Phaser.Scene {
  private stations: Station[] = [];
  private selected = 0;
  private spec: { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[] = [];
  private head!: Phaser.GameObjects.Text;
  private name!: Phaser.GameObjects.Text;
  /** Одна строка «чему учит уровень» под названием. */
  private desc!: Phaser.GameObjects.Text;
  /** «Начать» или «Продолжить» (у выбранного уровня есть автосохранение) и «Начать заново» под ней. */
  private startButton!: Button;
  private freshButton!: Button;

  constructor() {
    super('LevelSelect');
  }

  create(data: { levelId?: string }): void {
    enter(this);
    audio.music('menu');
    this.cameras.main.setBackgroundColor(COLOR.page);
    const all = levels();
    this.stations = [];
    this.spec = [];

    txt(this, X0, 64, t('levels.title'), { size: SIZE.h1, bold: true });
    txt(this, X0, 104, t('levels.hint'), { size: SIZE.small, color: COLOR.dim });

    // Линия: участок до каждого пройденного уровня — светлый, дальше — тёмный.
    const n = all.length;
    const left = 176;
    const right = W - 176;
    const xs = all.map((_, i) => (n === 1 ? W / 2 : left + ((right - left) * i) / (n - 1)));
    const g = this.add.graphics();
    for (let i = 0; i + 1 < n; i++) {
      const done = store.record(all[i].id) !== null;
      g.fillStyle(done ? COLOR.text : COLOR.rule, 1);
      g.fillRect(xs[i], LINE_Y - 3, xs[i + 1] - xs[i], 6);
    }

    all.forEach((level, i) => this.station(level, i, xs[i]));

    // Паспорт уровня.
    rule(this, X0, 368, W - X0 * 2);
    this.head = txt(this, X0, 392, '', { size: SIZE.micro, color: COLOR.dim, caps: true });
    this.name = txt(this, X0, 414, '', { size: SIZE.h1, bold: true });
    // Справа от описания стоит кнопка «Начать» шириной 260 — строка переносится до неё.
    this.desc = txt(this, X0, 452, '', { size: SIZE.small, color: COLOR.dim, wrap: W - X0 * 2 - 300 });
    for (let i = 0; i < 6; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = X0 + col * 300;
      const y = 482 + row * 64;
      this.spec.push({
        label: txt(this, x, y, '', { size: SIZE.micro, color: COLOR.faint, caps: true }),
        value: txt(this, x, y + 20, '', { size: SIZE.body }),
      });
    }

    // Есть незаконченный уровень (закрыли вкладку, перезагрузили страницу) — главная кнопка его продолжает.
    const saved = (): boolean => store.run()?.levelId === all[this.selected]?.id;
    const start = (): void => {
      const level = all[this.selected];
      if (level) go(this, 'Game', saved() ? { levelId: level.id, resume: true } : { levelId: level.id });
    };
    const fresh = (): void => {
      const level = all[this.selected];
      if (level) go(this, 'Game', { levelId: level.id });
    };
    this.startButton = new Button(this, W - X0 - 130, 446, { w: 260, h: 56, label: t('levels.start'), kind: 'primary', size: SIZE.title, onClick: start });
    this.freshButton = new Button(this, W - X0 - 130, 500, { w: 260, h: 34, label: t('levels.restart'), kind: 'quiet', size: SIZE.small, onClick: fresh });

    rule(this, X0, H - 72, W - X0 * 2);
    new Button(this, X0 + 80, H - 44, {
      w: 160,
      h: 36,
      label: t('levels.back'),
      kind: 'quiet',
      size: SIZE.small,
      alignLeft: true,
      onClick: () => go(this, 'Menu'),
    });

    // Сначала — уровень, откуда пришли; иначе незаконченный (его можно продолжить); иначе первый непройденный.
    const fromId = data?.levelId ? all.findIndex((l) => l.id === data.levelId) : -1;
    const runId = all.findIndex((l) => l.id === store.run()?.levelId);
    const firstOpen = all.findIndex((l) => store.record(l.id) === null);
    this.select(fromId >= 0 ? fromId : runId >= 0 ? runId : Math.max(0, firstOpen));

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (leaving(this)) return;
      if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') this.select(this.selected - 1, true);
      else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') this.select(this.selected + 1, true);
      else if (ev.repeat) return;
      else if (ev.code === 'Escape') go(this, 'Menu');
      else if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') start();
      else {
        const digit = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code);
        if (digit) this.select(Number(digit[1]) - 1, true);
      }
    });
  }

  private station(level: LevelData, i: number, x: number): void {
    const ring = this.add.circle(x, LINE_Y, R + 7).setStrokeStyle(2, COLOR.text).setVisible(false);
    const dot = this.add.circle(x, LINE_Y, R, COLOR.page);
    const num = txt(this, x, LINE_Y, String(i + 1), { size: SIZE.small, bold: true, ox: 0.5, oy: 0.5 });
    const title = txt(this, x, LINE_Y + 34, t(level.titleKey), { size: SIZE.body, ox: 0.5, align: 'center', wrap: 200 });
    const record = store.record(level.id);
    const marks = title.y + title.height + 12;
    if (level.endless) {
      const best = record?.launches ?? 0;
      txt(this, x, marks, best > 0 ? t('levels.launches', { n: best }) : t('levels.endless'), {
        size: SIZE.small,
        color: COLOR.dim,
        ox: 0.5,
      });
    } else {
      const stars = record?.stars ?? 0;
      for (let s = 0; s < 3; s++) {
        this.add.image(x + (s - 1) * 22, marks + 8, iconKey(s < stars ? 'star' : 'star_empty')).setDisplaySize(18, 18);
      }
    }
    const zone = this.add.zone(x, LINE_Y + 40, 200, 150).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (this.selected === i) {
        go(this, 'Game', store.run()?.levelId === level.id ? { levelId: level.id, resume: true } : { levelId: level.id });
        return;
      }
      audio.play('click');
      this.select(i);
    });
    zone.on('pointerover', () => setColor(title, COLOR.text));
    zone.on('pointerout', () => setColor(title, this.selected === i ? COLOR.text : COLOR.dim));
    this.stations.push({ x, dot, num, ring, title });
  }

  private select(index: number, sound = false): void {
    const all = levels();
    const i = Math.max(0, Math.min(all.length - 1, index));
    if (sound && i !== this.selected) audio.play('click');
    this.selected = i;
    this.stations.forEach((s, k) => {
      const done = store.record(all[k].id) !== null;
      s.dot.setFillStyle(done ? COLOR.text : COLOR.page).setStrokeStyle(3, done || k === i ? COLOR.text : COLOR.dim);
      setColor(s.num, done ? COLOR.onText : k === i ? COLOR.text : COLOR.dim);
      s.ring.setVisible(k === i);
      setColor(s.title, k === i ? COLOR.text : COLOR.dim);
    });
    this.describe(all[i], i);
    const saved = store.run()?.levelId === all[i].id;
    this.startButton.setLabel(t(saved ? 'levels.continue' : 'levels.start'));
    this.freshButton.setVisible(saved);
  }

  private describe(level: LevelData, index: number): void {
    setText(this.head, t('levels.number', { n: index + 1 }).toLocaleUpperCase('ru'));
    setText(this.name, t(level.titleKey));
    const descKey = `level.${level.id}.desc`;
    setText(this.desc, i18n.has(descKey) ? t(descKey) : '');
    const record = store.record(level.id);
    const item = t(`item.${level.targetItem}.name`);
    const shop = level.buildable.map((m) => t(`machine.${m}.name`)).join(', ');
    const rows: [string, string][] = [
      [t('levels.goal'), level.endless ? t('levels.goalEndless', { item, n: level.target, grow: level.endless.growBy }) : `${item} × ${level.target}`],
      level.endless
        ? [t('levels.launchEvery'), clock(level.endless.launchEvery)]
        : [t('levels.timeLimit'), clock(level.timeLimit)],
      [t('levels.energy'), t('levels.energyValue', { n: level.energy, robot: level.robotCost })],
      [t('levels.sensor'), level.allowedOps.includes('sense') ? t('levels.sensorYes', { n: level.sensorCost }) : t('levels.sensorNo')],
      [t('levels.shop'), shop || t('levels.shopNone')],
      [t('levels.best'), this.bestText(level, record)],
    ];
    rows.forEach(([label, value], k) => {
      setText(this.spec[k].label, label.toLocaleUpperCase('ru'));
      setText(this.spec[k].value, value);
    });
  }

  private bestText(level: LevelData, record: ReturnType<typeof store.record>): string {
    if (!record) return t('levels.bestNone');
    const best = level.endless ? t('levels.launches', { n: record.launches }) : t('levels.bestStars', { n: record.stars, time: clock(record.timeLeft) });
    // Think Award за этот уровень — рядом с лучшим результатом.
    return store.hasAward(level.id) ? `${best} · ${t('award.title')}` : best;
  }
}
