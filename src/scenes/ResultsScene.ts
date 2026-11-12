// Итог уровня поверх игры: ушла ли ракета, звёзды с условиями, что тормозило, куда дальше.
import Phaser from 'phaser';
import { DEPTH, H, W } from '../render/layout';
import { iconKey } from '../render/textures';
import { hintKey } from '../ui/hints';
import { clock, i18n, t } from '../ui/i18n';
import { levelById, levelIndex, nextLevel } from '../ui/levels';
import { COLOR, SIZE } from '../ui/theme';
import { Button, dimmer, plate, rule, txt } from '../ui/widgets';
import { enter } from './flow';

export interface ResultsData {
  levelId: string;
  won: boolean;
  endless: boolean;
  stars: number;
  starEnergyOk: boolean;
  starTimeOk: boolean;
  delivered: number;
  target: number;
  timeLeft: number;
  energySpent: number;
  energy: number;
  /** Порог звезды «экономия» и «скорость» (null — у уровня нет такой звезды). */
  starEnergy: number | null;
  starTimeLeft: number | null;
  misses: number;
  launches: number;
  /** Новый лучший результат. */
  best: boolean;
  /** Ключ совета «что тормозило», уже подобранный под уровень (или null). */
  bottleneckKey: string | null;
  /** Третье поражение подряд — спросить «Вам нужна подсказка?». */
  offerHint?: boolean;
  /** Think Award: игрок открыл телеметрию во время работы линии, исправил её на ходу и прошёл уровень. */
  thinkAward: boolean;
}

const PANEL_W = 600;
const PAD = 32;
const HINT_W = 520;

/** Что подсказать про третью звезду: не хватило скорости — совет этого уровня (или общий), не хватило экономии — общий. */
function starTipKey(r: ResultsData): string {
  if (!r.starTimeOk) {
    const own = `stars.tip.${r.levelId}`;
    return i18n.has(own) ? own : 'stars.tip.time';
  }
  return 'stars.tip.energy';
}

export class ResultsScene extends Phaser.Scene {
  /** Всё, что лежит в окне подсказки: его убирают целиком при закрытии. */
  private modal: { destroy(): void }[] = [];
  /** Пока открыто окно подсказки, клавиши достаются ему, а не итогам. */
  private modalKey: ((ev: KeyboardEvent) => void) | null = null;

  constructor() {
    super('Results');
  }

  create(r: ResultsData): void {
    this.modal = [];
    this.modalKey = null;
    enter(this, false);
    this.scene.bringToTop();
    const d = DEPTH.modal;
    dimmer(this, d);
    const level = levelById(r.levelId);
    const next = r.won ? nextLevel(r.levelId) : null;
    const passed = r.won || (r.endless && r.launches > 0);
    // Подсказка, как взять третью звезду (уровень пройден, но звёзд меньше трёх), и строка Think Award.
    // Тексты создаются заранее: окно растёт под их высоту.
    const tip =
      r.won && !r.endless && r.stars < 3
        ? txt(this, 0, 0, t(starTipKey(r)), { size: SIZE.small, color: COLOR.warn, wrap: PANEL_W - PAD * 2, lineSpacing: 3 }).setDepth(d + 2)
        : null;
    const award = passed
      ? txt(this, 0, 0, t(r.thinkAward ? 'award.got' : 'award.how'), {
          size: SIZE.small,
          color: r.thinkAward ? COLOR.text : COLOR.dim,
          wrap: PANEL_W - PAD * 2 - 60,
          lineSpacing: 3,
        }).setDepth(d + 2)
      : null;
    const tipH = tip ? 22 + tip.height + 14 : 0;
    const awardH = award ? Math.max(44, 24 + award.height) + 14 : 0;
    const panelH = 348 + tipH + awardH;
    const top = Math.round(H / 2 - panelH / 2);
    const left = W / 2 - PANEL_W / 2;
    const x = left + PAD;
    plate(this, W / 2, H / 2, PANEL_W, panelH, { fill: COLOR.chrome, stroke: COLOR.rule }).setDepth(d + 1);

    const head = level ? `${t('levels.number', { n: levelIndex(r.levelId) + 1 })} · ${t(level.titleKey)}` : '';
    txt(this, x, top + 28, head, { size: SIZE.micro, color: COLOR.dim, caps: true }).setDepth(d + 2);
    const title = r.endless ? t('results.endless', { n: r.launches }) : t(r.won ? 'results.won' : 'results.lost');
    txt(this, x, top + 48, title, { size: SIZE.h1, bold: true, color: r.won || (r.endless && r.launches > 0) ? COLOR.text : COLOR.miss }).setDepth(d + 2);
    if (r.best) txt(this, left + PANEL_W - PAD, top + 28, t('results.best'), { size: SIZE.micro, color: COLOR.ok, caps: true, ox: 1 }).setDepth(d + 2);

    let y = top + 112;
    if (r.won && !r.endless) {
      for (let s = 0; s < 3; s++) {
        this.add.image(x + 24 + s * 52, y + 24, iconKey(s < r.stars ? 'star' : 'star_empty')).setDisplaySize(44, 44).setDepth(d + 2);
      }
      const lines: [boolean, string][] = [
        [true, t('results.plan', { n: r.delivered, target: r.target })],
        [
          r.starEnergyOk,
          r.starEnergy === null
            ? t('results.energy', { n: r.energySpent, max: r.energy })
            : t('results.energyGoal', { n: r.energySpent, max: r.starEnergy }),
        ],
        [
          r.starTimeOk,
          r.starTimeLeft === null
            ? t('results.time', { time: clock(r.timeLeft) })
            : t('results.timeGoal', { time: clock(r.timeLeft), need: clock(r.starTimeLeft) }),
        ],
      ];
      lines.forEach(([ok, text], i) => this.criterion(x + 200, y + 4 + i * 26, ok, text, d + 2));
      y += 96;
    } else {
      txt(this, x, y, t(r.endless ? 'results.endlessText' : 'results.delivered', { n: r.delivered, target: r.target, launches: r.launches }), {
        size: SIZE.body,
        color: COLOR.text,
      }).setDepth(d + 2);
      y += 32;
      if (r.bottleneckKey) {
        txt(this, x, y, t('results.cause'), { size: SIZE.micro, color: COLOR.faint, caps: true }).setDepth(d + 2);
        txt(this, x, y + 20, t(r.bottleneckKey), { size: SIZE.body, color: COLOR.warn, wrap: PANEL_W - PAD * 2 }).setDepth(d + 2);
      }
      y += 64;
    }
    rule(this, x, y, PANEL_W - PAD * 2).setDepth(d + 2);
    txt(this, x, y + 16, t('results.misses', { n: r.misses }), { size: SIZE.small, color: COLOR.dim }).setDepth(d + 2);
    let ey = y + 52;
    if (tip) {
      txt(this, x, ey, t('stars.tipLabel'), { size: SIZE.micro, color: COLOR.faint, caps: true }).setDepth(d + 2);
      tip.setPosition(x, ey + 20);
      ey += tipH;
    }
    if (award) {
      // Медаль яркая, если награда получена; бледная — если нет, а текст рядом объясняет, как её заработать.
      this.add.image(x + 22, ey + 22, iconKey('award')).setDisplaySize(44, 44).setAlpha(r.thinkAward ? 1 : 0.35).setDepth(d + 2);
      txt(this, x + 60, ey, t(r.thinkAward ? 'award.title' : 'award.titleLocked'), {
        size: SIZE.body,
        bold: true,
        color: r.thinkAward ? COLOR.warn : COLOR.dim,
      }).setDepth(d + 2);
      award.setPosition(x + 60, ey + 24);
    }

    const by = top + panelH - 48;
    const retry = (): void => this.go('Game', { levelId: r.levelId });
    const toLevels = (): void => this.go('LevelSelect', { levelId: next?.id ?? r.levelId });
    const toNext = (): void => {
      if (next) this.go('Game', { levelId: next.id });
    };
    if (next) {
      new Button(this, left + PANEL_W - PAD - 90, by, { w: 180, h: 44, label: t('results.next'), kind: 'primary', size: SIZE.body, depth: d + 2, onClick: toNext });
      new Button(this, left + PANEL_W - PAD - 180 - 12 - 70, by, { w: 140, h: 44, label: t('results.retry'), depth: d + 2, onClick: retry });
    } else {
      new Button(this, left + PANEL_W - PAD - 90, by, { w: 180, h: 44, label: t('results.retry'), kind: 'primary', size: SIZE.body, depth: d + 2, onClick: retry });
    }
    new Button(this, x + 70, by, { w: 140, h: 44, label: t('results.levels'), kind: 'quiet', depth: d + 2, onClick: toLevels });

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (this.modalKey) {
        this.modalKey(ev);
        return;
      }
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter') (next ? toNext : retry)();
      else if (ev.code === 'KeyR') retry();
      else if (ev.code === 'Escape' || ev.code === 'KeyM') toLevels();
    });

    if (r.offerHint && !r.won) this.askHint(levelIndex(r.levelId), d + 10);
  }

  // ---------- подсказка после трёх поражений ----------

  /** Окно «Вам нужна подсказка?» поверх итогов. «Да» — показать, как пройти уровень, «Нет» — закрыть. */
  private askHint(index: number, depth: number): void {
    const body = txt(this, 0, 0, t('hint.askText'), { size: SIZE.body, color: COLOR.dim, wrap: HINT_W - PAD * 2 });
    const yes = (): void => this.showHint(index, depth);
    const no = (): void => this.closeHint();
    this.hintWindow(depth, t('hint.ask'), body, [
      { label: t('hint.yes'), primary: true, onClick: yes },
      { label: t('hint.no'), primary: false, onClick: no },
    ]);
    this.modalKey = (ev) => {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter') yes();
      else if (ev.code === 'Escape') no();
    };
  }

  private showHint(index: number, depth: number): void {
    this.closeHint();
    const key = hintKey(index);
    const body = txt(this, 0, 0, i18n.has(key) ? t(key) : t('hint.generic'), { size: SIZE.body, color: COLOR.text, wrap: HINT_W - PAD * 2, lineSpacing: 4 });
    const ok = (): void => this.closeHint();
    this.hintWindow(depth, t('hint.title'), body, [{ label: t('hint.ok'), primary: true, onClick: ok }]);
    this.modalKey = (ev) => {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Escape') ok();
    };
  }

  /** Окно по центру: заголовок, текст и кнопки справа внизу. Высота подстраивается под текст. */
  private hintWindow(
    depth: number,
    title: string,
    body: Phaser.GameObjects.Text,
    buttons: { label: string; primary: boolean; onClick: () => void }[],
  ): void {
    const h = PAD + 34 + body.height + 28 + 44 + PAD;
    const top = Math.round(H / 2 - h / 2);
    const left = W / 2 - HINT_W / 2;
    const shade = dimmer(this, depth, 0.6);
    const panel = plate(this, W / 2, H / 2, HINT_W, h, { fill: COLOR.chrome, stroke: COLOR.warn, strokeAlpha: 0.6 }).setDepth(depth + 1);
    const head = txt(this, left + PAD, top + PAD, title, { size: SIZE.title, bold: true, color: COLOR.warn }).setDepth(depth + 2);
    body.setPosition(left + PAD, top + PAD + 34).setDepth(depth + 2);
    this.modal.push(shade, panel, head, body);
    let bx = left + HINT_W - PAD;
    const by = top + h - PAD - 22;
    for (const b of buttons) {
      const bw = b.primary ? 210 : 180;
      const btn = new Button(this, bx - bw / 2, by, {
        w: bw,
        h: 44,
        label: b.label,
        kind: b.primary ? 'primary' : 'quiet',
        size: SIZE.body,
        depth: depth + 2,
        onClick: b.onClick,
      });
      this.modal.push(btn);
      bx -= bw + 12;
    }
  }

  private closeHint(): void {
    for (const o of this.modal) o.destroy();
    this.modal = [];
    this.modalKey = null;
  }

  /** Лампа условия: зелёная — выполнено, серая — нет. */
  private criterion(x: number, y: number, ok: boolean, text: string, depth: number): void {
    this.add.circle(x, y + 9, 5, ok ? COLOR.ok : 0x44556b).setDepth(depth);
    txt(this, x + 16, y, text, { size: SIZE.small, color: ok ? COLOR.text : COLOR.dim }).setDepth(depth);
  }

  private go(key: string, data: object): void {
    this.scene.stop('Game');
    this.scene.start(key, data);
  }
}
