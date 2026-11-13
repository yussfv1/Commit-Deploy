// «Код для настоящего робота»: программа робота из игры — как OpMode для FIRST Tech Challenge (FTC) на Java.
// Это тот же показ, только записанный так, как его написала бы команда робототехников:
//   шаг по клетке  → bot.drive(сторона света, сколько клеток)  — поле на соревнованиях тоже размечено плитками;
//   ВЗЯТЬ/ПОЛОЖИТЬ → bot.grab() / bot.release()                 — захват;
//   ДАТЧИК         → while (!bot.machineReady()) idle();         — ждём по датчику, а не по таймеру;
//   ЖДАТЬ ×N       → sleep(N × 250 мс)                           — один шаг в игре длится 0,25 секунды.
// DeployBot — класс-обёртка над моторами, захватом и датчиком. Его тоже даёт игра (deployBotJava, вторая вкладка
// окна кода): меканум-шасси с энкодерами, захват на сервоприводе и цифровой вход «машина готова». Оба файла
// кладутся в TeamCode проекта FTC SDK — и OpMode собирается.
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
    'import static org.firstinspires.ftc.teamcode.DeployBot.Dir.*;',
    '',
    `// Commit & Deploy: робот ${info.robot}, док ${info.dock}. Этот код получился из твоего показа.`,
    usesSensor
      ? '// ДАТЧИК — обратная связь: робот ждёт готовую машину, а не считает секунды.'
      : '// Без датчика робот действует «вслепую»: только по времени.',
    `@Autonomous(name = "Commit & Deploy Robot ${info.robot}")`,
    `public class CommitDeployRobot${info.robot} extends LinearOpMode {`,
    '    @Override',
    '    public void runOpMode() {',
    '        DeployBot bot = new DeployBot(this);          // моторы, захват, датчик — файл DeployBot.java',
    '        waitForStart();',
    '        while (opModeIsActive()) {                    // показ повторяется по кругу',
    ...bodyLines(program),
    '        }',
    '    }',
    '}',
  ];
}

/** Параметры шасси в DeployBot.java: мотор goBILDA 5203 (312 об/мин), колесо меканум 96 мм, плитка поля FTC — 24 дюйма. */
export const TICKS_PER_REV = 537.7;
export const WHEEL_MM = 96;
export const TILE_MM = 609.6;
/** Сколько импульсов энкодера на одну плитку поля (то же число, что считает Java-класс). */
export const TICKS_PER_TILE = Math.round((TILE_MM / (Math.PI * WHEEL_MM)) * TICKS_PER_REV);

/**
 * DeployBot.java — «руки и ноги» робота для OpMode из игры. Меканум едет в любую сторону света, не поворачиваясь,
 * как робот в игре; ВЗЯТЬ/ПОЛОЖИТЬ — сервопривод захвата; ДАТЧИК — цифровой вход, на который машина подаёт «готово».
 * Имена устройств совпадают с конфигурацией на Driver Station: front_left, front_right, back_left, back_right, claw, machine_ready.
 */
export function deployBotJava(): string[] {
  return [
    'package org.firstinspires.ftc.teamcode;',
    '',
    'import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;',
    'import com.qualcomm.robotcore.hardware.DcMotor;',
    'import com.qualcomm.robotcore.hardware.DcMotorSimple;',
    'import com.qualcomm.robotcore.hardware.DigitalChannel;',
    'import com.qualcomm.robotcore.hardware.Servo;',
    '',
    '// Commit & Deploy: робот для OpMode из игры. Шасси меканум едет в любую сторону, не поворачиваясь, — как в игре.',
    '// Имена устройств — как в конфигурации на Driver Station.',
    'public class DeployBot {',
    '    public enum Dir { NORTH, EAST, SOUTH, WEST }',
    '',
    `    static final double TICKS_PER_REV = ${TICKS_PER_REV};          // goBILDA 5203, 312 об/мин`,
    `    static final double WHEEL_MM = ${WHEEL_MM.toFixed(1)};               // колесо меканум 96 мм`,
    `    static final double TILE_MM = ${TILE_MM};               // плитка поля FTC — 24 дюйма`,
    '    static final int TICKS_PER_TILE = (int) Math.round(TILE_MM / (Math.PI * WHEEL_MM) * TICKS_PER_REV);',
    '    static final double DRIVE_POWER = 0.5;',
    '    static final double CLAW_OPEN = 0.0;',
    '    static final double CLAW_CLOSED = 0.6;',
    '',
    '    private final LinearOpMode op;',
    '    private final DcMotor frontLeft, frontRight, backLeft, backRight;',
    '    private final Servo claw;',
    '    private final DigitalChannel readySignal;',
    '',
    '    public DeployBot(LinearOpMode op) {',
    '        this.op = op;',
    '        frontLeft = op.hardwareMap.get(DcMotor.class, "front_left");',
    '        frontRight = op.hardwareMap.get(DcMotor.class, "front_right");',
    '        backLeft = op.hardwareMap.get(DcMotor.class, "back_left");',
    '        backRight = op.hardwareMap.get(DcMotor.class, "back_right");',
    '        claw = op.hardwareMap.get(Servo.class, "claw");',
    '        readySignal = op.hardwareMap.get(DigitalChannel.class, "machine_ready");',
    '        readySignal.setMode(DigitalChannel.Mode.INPUT);',
    '        frontLeft.setDirection(DcMotorSimple.Direction.REVERSE);',
    '        backLeft.setDirection(DcMotorSimple.Direction.REVERSE);',
    '        for (DcMotor m : new DcMotor[] { frontLeft, frontRight, backLeft, backRight }) {',
    '            m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);',
    '            m.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);',
    '        }',
    '        claw.setPosition(CLAW_OPEN);',
    '    }',
    '',
    '    /** Шаг в игре: проехать tiles плиток в сторону света по энкодерам. */',
    '    public void drive(Dir dir, int tiles) {',
    '        int t = tiles * TICKS_PER_TILE;',
    '        int forward = dir == Dir.NORTH ? t : dir == Dir.SOUTH ? -t : 0;',
    '        int strafe = dir == Dir.EAST ? t : dir == Dir.WEST ? -t : 0;',
    '        // Меканум: вперёд все колёса крутятся в одну сторону, вбок — диагонали навстречу друг другу.',
    '        move(frontLeft, forward + strafe);',
    '        move(frontRight, forward - strafe);',
    '        move(backLeft, forward - strafe);',
    '        move(backRight, forward + strafe);',
    '        while (op.opModeIsActive() && (frontLeft.isBusy() || frontRight.isBusy() || backLeft.isBusy() || backRight.isBusy())) {',
    '            op.idle();',
    '        }',
    '        for (DcMotor m : new DcMotor[] { frontLeft, frontRight, backLeft, backRight }) m.setPower(0);',
    '    }',
    '',
    '    private void move(DcMotor m, int ticks) {',
    '        m.setTargetPosition(m.getCurrentPosition() + ticks);',
    '        m.setMode(DcMotor.RunMode.RUN_TO_POSITION);',
    '        m.setPower(DRIVE_POWER);',
    '    }',
    '',
    '    /** ВЗЯТЬ: закрыть захват. */',
    '    public void grab() {',
    '        claw.setPosition(CLAW_CLOSED);',
    '        op.sleep(300);',
    '    }',
    '',
    '    /** ПОЛОЖИТЬ: открыть захват. */',
    '    public void release() {',
    '        claw.setPosition(CLAW_OPEN);',
    '        op.sleep(300);',
    '    }',
    '',
    '    /** ДАТЧИК: машина подаёт «готово» на цифровой вход (вход REV Hub подтянут к питанию, готово = низкий уровень). */',
    '    public boolean machineReady() {',
    '        return !readySignal.getState();',
    '    }',
    '}',
  ];
}
