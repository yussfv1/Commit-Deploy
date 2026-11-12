// Окно «Код для настоящего робота» поверх игры: программа выбранного робота как OpMode FTC на Java
// (строки готовит ui/ftcCode.ts). Код и комментарии разного цвета, длинную программу можно прокрутить
// колесом или стрелками, кнопка «Скопировать» кладёт весь текст в буфер обмена.
import Phaser from 'phaser';
import { DEPTH, H, W } from '../render/layout';
import { t } from '../ui/i18n';
import { COLOR, SIZE } from '../ui/theme';
import { Button, dimmer, plate, setColor, setText, txt } from '../ui/widgets';
import { enter } from './flow';

const PANEL_W = 860;
const PANEL_H = 680;
const PAD = 28;
const CODE_SIZE = 13;
const LINE_H = 16;
/** Верх области кода от верха окна и место под кнопки снизу. */
const CODE_TOP = 104;
const FOOTER = 76;

export interface CodeData {
  lines: string[];
  robot: number;
}

export class CodeScene extends Phaser.Scene {
  constructor() {
    super('Code');
  }

  create(data: CodeData): void {
    enter(this, false);
    this.scene.bringToTop();
    const d = DEPTH.modal;
    dimmer(this, d);
    const left = Math.round(W / 2 - PANEL_W / 2);
    const top = Math.round(H / 2 - PANEL_H / 2);
    plate(this, W / 2, H / 2, PANEL_W, PANEL_H, { fill: COLOR.chrome, stroke: COLOR.rule }).setDepth(d + 1);
    txt(this, left + PAD, top + 24, t('ftc.title', { n: data.robot }), { size: SIZE.title, bold: true }).setDepth(d + 2);
    txt(this, left + PAD, top + 54, t('ftc.sub'), { size: SIZE.small, color: COLOR.dim, wrap: PANEL_W - PAD * 2, lineSpacing: 3 }).setDepth(d + 2);

    // Область кода: тёмная подложка, строки в контейнере, всё, что ниже края, обрезает маска.
    const areaX = left + PAD;
    const areaY = top + CODE_TOP;
    const areaW = PANEL_W - PAD * 2;
    const areaH = PANEL_H - CODE_TOP - FOOTER;
    plate(this, areaX + areaW / 2, areaY + areaH / 2, areaW, areaH, { fill: COLOR.sunken, stroke: COLOR.rule }).setDepth(d + 2);
    const list = this.add.container(areaX + 16, areaY + 10).setDepth(d + 3);
    data.lines.forEach((line, i) => {
      const y = i * LINE_H;
      const cut = line.indexOf('//');
      const code = cut < 0 ? line : line.slice(0, cut);
      const comment = cut < 0 ? '' : line.slice(cut);
      const codeText = txt(this, 0, y, code, { size: CODE_SIZE, mono: true, color: COLOR.text });
      list.add(codeText);
      if (comment) {
        // Комментарий — тусклым цветом сразу после кода: так видно, что команда, а что пояснение.
        list.add(txt(this, codeText.width, y, comment, { size: CODE_SIZE, mono: true, color: COLOR.dim }));
      }
    });
    const mask = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(areaX, areaY + 2, areaW, areaH - 4);
    list.setMask(mask.createGeometryMask());

    const contentH = data.lines.length * LINE_H + 20;
    const maxScroll = Math.max(0, contentH - areaH);
    let scroll = 0;
    const scrollBy = (dy: number): void => {
      scroll = Math.max(0, Math.min(maxScroll, scroll + dy));
      list.setY(areaY + 10 - scroll);
    };
    if (maxScroll > 0) {
      txt(this, areaX + areaW - 10, areaY + areaH - 8, t('ftc.scroll'), { size: SIZE.micro, color: COLOR.faint, ox: 1, oy: 1 }).setDepth(d + 4);
      this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => scrollBy(dy * 0.6));
    }

    // Кнопки: скопировать весь код и закрыть окно.
    const by = top + PANEL_H - FOOTER / 2;
    const status = txt(this, areaX, by, '', { size: SIZE.small, color: COLOR.ok, oy: 0.5 }).setDepth(d + 2);
    const copy = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(data.lines.join('\n'));
        setColor(status, COLOR.ok);
        setText(status, t('ftc.copied'));
      } catch {
        setColor(status, COLOR.warn);
        setText(status, t('ftc.copyFail'));
      }
    };
    const close = (): void => {
      this.scene.stop();
      this.scene.resume('Game');
    };
    new Button(this, left + PANEL_W - PAD - 80, by, { w: 160, h: 44, label: t('ftc.close'), kind: 'primary', size: SIZE.body, depth: d + 2, onClick: close });
    new Button(this, left + PANEL_W - PAD - 160 - 12 - 90, by, { w: 180, h: 44, label: t('ftc.copy'), size: SIZE.body, depth: d + 2, onClick: () => void copy() });

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.code === 'Escape' || ev.code === 'Enter' || ev.code === 'NumpadEnter') close();
      else if (ev.code === 'ArrowDown') scrollBy(LINE_H * 3);
      else if (ev.code === 'ArrowUp') scrollBy(-LINE_H * 3);
    });
  }
}
