// «Код для настоящего робота»: программа робота из игры — как OpMode для FIRST Tech Challenge (FTC) на Java.
// Это тот же показ, только записанный так, как его написала бы команда робототехников:
//   шаг по клетке  → bot.drive(сторона света, сколько клеток)  — поле на соревнованиях тоже размечено плитками;
//   ВЗЯТЬ/ПОЛОЖИТЬ → bot.grab() / bot.release()                 — захват;
//   ДАТЧИК         → while (!bot.machineReady()) idle();         — ждём по датчику, а не по таймеру;
//   ЖДАТЬ ×N       → sleep(N × 250 мс)                           — один шаг в игре длится 0,25 секунды.
// TMinusBot — класс-обёртка над моторами, захватом и датчиком: у каждой команды он свой, здесь — только вызовы.
import type { Block, Op } from '../types';

/** Сколько миллисекунд длится один шаг робота в игре (5 тиков по 50 мс). */
export const STEP_MS = 250;

const MOVE: Partial<Record<Op, { dir: string; arrow: string }>> = {
  up: { dir: 'NORTH', arrow: '↑' },
  right: { dir: 'EAST', arrow: '→' },
  down: { dir: 'SOUTH', arrow: '↓' },
  left: { dir: 'WEST', arrow: '←' },
};

/** Ширина колонки, с которой начинаются комментарии в теле цикла. */
const COMMENT_AT = 42;

const withComment = (code: string, comment: string): string => `${code.padEnd(COMMENT_AT)} // ${comment}`;

/** Тело цикла: соседние шаги в одну сторону склеиваются в один вызов drive. */
function bodyLines(program: readonly Block[]): string[] {
  const out: string[] = [];
  const pad = ' '.repeat(12);
  for (let i = 0; i < program.length; i++) {
    const b = program[i];
    const move = MOVE[b.op];
    if (move) {
      let n = 1;
      while (i + 1 < program.length && program[i + 1].op === b.op) {
        n++;
        i++;
      }
      out.push(withComment(`${pad}bot.drive(${move.dir}, ${n});`, `${move.arrow} ×${n}`));
    } else if (b.op === 'take') {
      out.push(withComment(`${pad}bot.grab();`, 'ВЗЯТЬ'));
    } else if (b.op === 'put') {
      out.push(withComment(`${pad}bot.release();`, 'ПОЛОЖИТЬ'));
    } else if (b.op === 'wait') {
      const n = b.n ?? 1;
      out.push(withComment(`${pad}sleep(${n * STEP_MS});`, `ЖДАТЬ ×${n}`));
    } else if (b.op === 'sense') {
      out.push(withComment(`${pad}while (opModeIsActive() && !bot.machineReady()) idle();`, 'ДАТЧИК'));
    }
  }
  return out;
}

export interface FtcCodeInfo {
  /** Номер робота в подписях игры («Робот 2»). */
  robot: number;
  /** Номер дока, с которого он начинает круг. */
  dock: number;
}

/** Программа робота как файл OpMode FTC на Java — по строке на элемент массива. */
export function toFtcJava(program: readonly Block[], info: FtcCodeInfo): string[] {
  const usesSensor = program.some((b) => b.op === 'sense');
  return [
    'package org.firstinspires.ftc.teamcode;',
    '',
    'import com.qualcomm.robotcore.eventloop.opmode.Autonomous;',
    'import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;',
    'import static org.firstinspires.ftc.teamcode.TMinusBot.Dir.*;',
    '',
    `// T-MINUS: робот ${info.robot}, док ${info.dock}. Этот код получился из твоего показа.`,
    usesSensor
      ? '// ДАТЧИК — обратная связь: робот ждёт готовую машину, а не считает секунды.'
      : '// Без датчика робот действует «вслепую»: только по времени.',
    `@Autonomous(name = "T-MINUS Robot ${info.robot}")`,
    `public class TMinusRobot${info.robot} extends LinearOpMode {`,
    '    @Override',
    '    public void runOpMode() {',
    '        TMinusBot bot = new TMinusBot(hardwareMap);   // моторы, захват, датчик',
    '        waitForStart();',
    '        while (opModeIsActive()) {                    // показ повторяется по кругу',
    ...bodyLines(program),
    '        }',
    '    }',
    '}',
  ];
}
