import { describe, expect, it } from 'vitest';
import { prog } from '../../sim/__tests__/helpers';
import { STEP_MS, toFtcJava } from '../ftcCode';

describe('код для настоящего робота (FTC, Java)', () => {
  const code = (text: string) => toFtcJava(prog(text), { robot: 2, dock: 1 });

  it('это настоящий OpMode: класс, waitForStart и цикл по кругу', () => {
    const lines = code('L T R4 P L3');
    expect(lines).toContain('public class CommitDeployRobot2 extends LinearOpMode {');
    expect(lines).toContain('@Autonomous(name = "Commit & Deploy Robot 2")');
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

describe('DeployBot.java — класс робота для OpMode', () => {
  it('в нём есть всё, что вызывает OpMode: drive по сторонам света, grab, release, machineReady', async () => {
    const { deployBotJava, toFtcJava: opMode } = await import('../ftcCode');
    const bot = deployBotJava().join('\n');
    expect(bot).toContain('public class DeployBot {');
    expect(bot).toContain('public enum Dir { NORTH, EAST, SOUTH, WEST }');
    for (const m of ['public void drive(Dir dir, int tiles)', 'public void grab()', 'public void release()', 'public boolean machineReady()']) {
      expect(bot).toContain(m);
    }
    // OpMode создаёт робота так, как ждёт конструктор.
    expect(bot).toContain('public DeployBot(LinearOpMode op)');
    expect(opMode(prog('L T R1 P R'), { robot: 1, dock: 1 }).join('\n')).toContain('new DeployBot(this)');
    expect(bot.split('{').length).toBe(bot.split('}').length);
    expect(bot.split('(').length).toBe(bot.split(')').length);
  });

  it('импульсов на плитку — как в Java: 609,6 мм / (π · 96 мм) · 537,7', async () => {
    const { TICKS_PER_TILE } = await import('../ftcCode');
    expect(TICKS_PER_TILE).toBe(1087);
  });
});
