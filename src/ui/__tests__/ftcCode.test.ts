import { describe, expect, it } from 'vitest';
import { prog } from '../../sim/__tests__/helpers';
import { STEP_MS, toFtcJava } from '../ftcCode';

describe('код для настоящего робота (FTC, Java)', () => {
  const code = (text: string) => toFtcJava(prog(text), { robot: 2, dock: 1 });

  it('это настоящий OpMode: класс, waitForStart и цикл по кругу', () => {
    const lines = code('L T R4 P L3');
    expect(lines).toContain('public class TMinusRobot2 extends LinearOpMode {');
    expect(lines).toContain('@Autonomous(name = "T-MINUS Robot 2")');
    expect(lines.some((l) => l.includes('waitForStart();'))).toBe(true);
    expect(lines.some((l) => l.includes('while (opModeIsActive())'))).toBe(true);
    // Скобки сбалансированы — файл можно открыть в Android Studio.
    const text = lines.join('\n');
    expect(text.split('{').length).toBe(text.split('}').length);
  });

  it('шаги в одну сторону склеиваются, действия и ожидание переводятся в вызовы', () => {
    const body = code('L T R4 W3 P L3').filter((l) => l.startsWith('            '));
    expect(body.map((l) => l.trim().split('//')[0].trim())).toEqual([
      'bot.drive(WEST, 1);',
      'bot.grab();',
      'bot.drive(EAST, 4);',
      `sleep(${3 * STEP_MS});`,
      'bot.release();',
      'bot.drive(WEST, 3);',
    ]);
  });

  it('ДАТЧИК — это ожидание по датчику, а не по таймеру', () => {
    const lines = code('L S T R4 S P L4');
    expect(lines.filter((l) => l.includes('bot.machineReady()'))).toHaveLength(2);
    expect(lines.some((l) => l.includes('обратная связь'))).toBe(true);
  });
});
