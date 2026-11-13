// Музыка, которую играет сам код (Web Audio), — файлов и лицензий не нужно.
//   menu  — спокойные аккорды и перебор в ля миноре, 84 удара в минуту: меню и выбор уровня.
//   shift — ровный рабочий ритм для линии, 120 ударов в минуту: восьмая нота длится 0,25 с — ровно один шаг
//           робота (5 тиков по 50 мс), поэтому шаги роботов ложатся в долю.
// Ноты описаны чистыми функциями (их проверяет тест), а MusicPlayer раскладывает их по времени AudioContext
// на полтакта вперёд. Во время показа музыка глохнет фильтром («настоящий мир на паузе»), перед стартом ракеты
// затихает, чтобы было слышно отсчёт.
import type { MusicName } from './audio';

export type Voice = 'pad' | 'pluck' | 'bass' | 'kick' | 'hat';

export interface MusicNote {
  /** Начало от начала такта, в долях (в такте 4 доли). */
  at: number;
  /** Длительность в долях. */
  dur: number;
  /** Высота: номер ноты MIDI (69 = ля первой октавы, 440 Гц). У ударных — 0. */
  midi: number;
  voice: Voice;
  gain: number;
}

export interface Track {
  bpm: number;
  /** Сколько тактов в круге — дальше всё повторяется. */
  bars: number;
  bar(index: number): MusicNote[];
}

export const BEATS_PER_BAR = 4;
export const midiFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
/** Длительность доли в секундах. */
export const beatSeconds = (bpm: number): number => 60 / bpm;

/** Аккорды ля минора, тесное расположение около до первой октавы: Am – F – C – G. */
const CHORDS: readonly { root: number; tones: readonly number[] }[] = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [57, 60, 65] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
];

/** Ля-минорная пентатоника второй октавы — для коротких мотивов на линии. */
const PENTA = [69, 72, 74, 76, 79, 81];

const MENU: Track = {
  bpm: 84,
  bars: 8,
  bar(index) {
    const i = ((index % 8) + 8) % 8;
    const chord = CHORDS[Math.floor(i / 2)];
    const notes: MusicNote[] = [];
    // Аккорд держится два такта.
    if (i % 2 === 0) for (const m of chord.tones) notes.push({ at: 0, dur: 8, midi: m, voice: 'pad', gain: 0.12 });
    notes.push({ at: 0, dur: 4, midi: chord.root, voice: 'bass', gain: 0.08 });
    // Перебор восьмыми, с паузами, чтобы музыка дышала: вверх по аккорду и обратно, на октаву выше.
    const order = [0, 1, 2, 1, 2, 0, 1, 2];
    for (let k = 0; k < 8; k++) {
      if (k === 3 || k === 7) continue;
      notes.push({ at: k * 0.5, dur: 0.9, midi: chord.tones[order[k]] + 12, voice: 'pluck', gain: i < 2 ? 0.035 : 0.05 });
    }
    return notes;
  },
};

/** Мотивы для второй половины круга линии: доля в такте и ступень пентатоники. */
const MOTIFS: readonly (readonly [number, number])[][] = [
  [[0.5, 3], [1.5, 2], [3, 0]],
  [[0, 2], [1, 3], [2.5, 4]],
  [[0.5, 1], [2, 2], [3.5, 3]],
  [[0, 4], [1.5, 3], [2, 2], [3, 1]],
];

const SHIFT: Track = {
  bpm: 120,
  bars: 8,
  bar(index) {
    const i = ((index % 8) + 8) % 8;
    const chord = CHORDS[i % 4];
    const notes: MusicNote[] = [];
    // Бочка на первую и третью долю, тарелка — на слабые восьмые.
    notes.push({ at: 0, dur: 0.5, midi: 0, voice: 'kick', gain: 0.16 }, { at: 2, dur: 0.5, midi: 0, voice: 'kick', gain: 0.13 });
    for (let k = 0; k < 4; k++) notes.push({ at: k + 0.5, dur: 0.12, midi: 0, voice: 'hat', gain: k % 2 === 1 ? 0.04 : 0.028 });
    // Бас пульсирует восьмыми: тоника и октава через одну — как мерный ход линии.
    for (let k = 0; k < 8; k++) {
      notes.push({ at: k * 0.5, dur: 0.42, midi: chord.root + (k % 2 === 1 ? 12 : 0), voice: 'bass', gain: k === 0 ? 0.09 : 0.07 });
    }
    // Тихий аккорд на весь такт — тепло под ритмом.
    for (const m of chord.tones) notes.push({ at: 0, dur: 4, midi: m, voice: 'pad', gain: 0.045 });
    // Во второй половине круга — короткий мотив сверху.
    if (i >= 4) for (const [at, step] of MOTIFS[i - 4]) notes.push({ at, dur: 0.6, midi: PENTA[step], voice: 'pluck', gain: 0.055 });
    return notes;
  },
};

export const TRACKS: Readonly<Record<MusicName, Track>> = { menu: MENU, shift: SHIFT };

/** Музыка на Web Audio: раскладывает такты заранее, умеет приглушаться фильтром и затихать. */
export class MusicPlayer {
  private readonly ctx: AudioContext;
  private readonly bus: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly duckGain: GainNode;
  private readonly noise: AudioBuffer | null;
  private track: Track | null = null;
  private name: MusicName | null = null;
  private barIndex = 0;
  private nextBar = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private muffled = false;

  constructor(ctx: AudioContext, out: AudioNode, noise: AudioBuffer | null) {
    this.ctx = ctx;
    this.noise = noise;
    this.bus = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.duckGain = ctx.createGain();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.filter.Q.value = 0.5;
    this.bus.connect(this.filter);
    this.filter.connect(this.duckGain);
    this.duckGain.connect(out);
    this.bus.gain.value = 0.0001;
  }

  get playing(): MusicName | null {
    return this.name;
  }

  /** Начать трек (или продолжить, если играет он же). */
  play(name: MusicName): void {
    if (this.name === name) return;
    const now = this.ctx.currentTime;
    // Смена трека: старый быстро уводим в тишину, новый вступает с начала такта.
    const switching = this.name !== null;
    const start = now + (switching ? 0.35 : 0.08);
    this.name = name;
    this.track = TRACKS[name];
    this.barIndex = 0;
    this.nextBar = start;
    const g = this.bus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    if (switching) g.linearRampToValueAtTime(0.0001, now + 0.3);
    g.linearRampToValueAtTime(1, start + 1);
    if (this.timer === null) this.timer = setInterval(() => this.pump(), 60);
    this.pump();
  }

  /** Затихнуть и перестать раскладывать такты. */
  stop(fade = 0.5): void {
    if (this.name === null) return;
    const now = this.ctx.currentTime;
    this.name = null;
    this.track = null;
    const g = this.bus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(0.0001, now + fade);
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Приглушить (показ: настоящий мир стоит) или вернуть как было. */
  setMuffled(on: boolean): void {
    if (on === this.muffled) return;
    this.muffled = on;
    const now = this.ctx.currentTime;
    const f = this.filter.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(on ? 650 : 18000, now + 0.35);
    const d = this.duckGain.gain;
    d.cancelScheduledValues(now);
    d.setValueAtTime(d.value, now);
    d.linearRampToValueAtTime(on ? 0.6 : 1, now + 0.35);
  }

  /** Затихнуть на время (отсчёт и старт ракеты), потом вернуться. */
  duck(seconds: number, level = 0.2): void {
    const now = this.ctx.currentTime;
    const d = this.duckGain.gain;
    d.cancelScheduledValues(now);
    d.setValueAtTime(d.value, now);
    d.linearRampToValueAtTime(level, now + 0.3);
    d.setValueAtTime(level, now + seconds);
    d.linearRampToValueAtTime(this.muffled ? 0.6 : 1, now + seconds + 1);
  }

  /** Раскладываем такты, которые начнутся в ближайшие полсекунды. */
  private pump(): void {
    const track = this.track;
    if (!track) return;
    const now = this.ctx.currentTime;
    // Вкладку прятали или поток стоял: не догоняем пропущенное разом, а начинаем с ближайшего такта.
    if (this.nextBar < now) this.nextBar = now + 0.05;
    const beat = beatSeconds(track.bpm);
    while (this.nextBar < now + 0.5) {
      for (const n of track.bar(this.barIndex)) this.voice(n, this.nextBar + n.at * beat, n.dur * beat);
      this.nextBar += BEATS_PER_BAR * beat;
      this.barIndex = (this.barIndex + 1) % track.bars;
    }
  }

  private voice(n: MusicNote, t: number, dur: number): void {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.connect(this.bus);
    const g = gain.gain;
    const end = t + dur;
    const nodes: AudioScheduledSourceNode[] = [];
    if (n.voice === 'pad') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      filter.connect(gain);
      for (const [type, detune] of [['triangle', 0], ['sine', 7]] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = midiFreq(n.midi);
        osc.detune.value = detune;
        osc.connect(filter);
        nodes.push(osc);
      }
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(n.gain, t + Math.min(0.5, dur / 3));
      g.setValueAtTime(n.gain, Math.max(t + 0.5, end - 0.6));
      g.linearRampToValueAtTime(0.0001, end);
    } else if (n.voice === 'pluck' || n.voice === 'bass') {
      const osc = ctx.createOscillator();
      osc.type = n.voice === 'pluck' ? 'sine' : 'triangle';
      osc.frequency.value = midiFreq(n.midi);
      if (n.voice === 'bass') {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        osc.connect(filter);
        filter.connect(gain);
      } else {
        osc.connect(gain);
      }
      nodes.push(osc);
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(n.gain, t + 0.006);
      g.exponentialRampToValueAtTime(0.0001, end);
    } else if (n.voice === 'kick') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      osc.connect(gain);
      nodes.push(osc);
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(n.gain, t + 0.004);
      g.exponentialRampToValueAtTime(0.0001, t + 0.22);
    } else if (this.noise) {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      src.buffer = this.noise;
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      src.connect(filter);
      filter.connect(gain);
      nodes.push(src);
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(n.gain, t + 0.002);
      g.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, dur));
    }
    if (nodes.length === 0) {
      gain.disconnect();
      return;
    }
    const stopAt = (n.voice === 'kick' ? t + 0.25 : end) + 0.05;
    nodes.forEach((node, k) => {
      node.start(t);
      node.stop(stopAt);
      if (k === 0) node.onended = () => gain.disconnect();
    });
  }
}
