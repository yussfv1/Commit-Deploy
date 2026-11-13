// Звук игры на Web Audio. Если роль C положила файл (public/assets/sfx/<имя>.wav или .mp3) — играет он,
// если файла нет — тот же звук синтезируется кодом. Игра звучит сразу, а файлы подменяют синтез без правок кода.
// Музыка так же: файла music/<имя>.mp3 нет — её играет код (src/ui/music.ts).
import { MusicPlayer } from './music';
import { Throttle } from './throttle';

export const SFX = [
  'step',
  'take',
  'put',
  'miss',
  'sense',
  'produce',
  'deliver',
  'deploy',
  'click',
  'error',
  'countdown',
  'launch',
  'win',
  'lose',
  'alarm',
] as const;
export type SfxName = (typeof SFX)[number];

export const MUSIC = ['menu', 'shift'] as const;
export type MusicName = (typeof MUSIC)[number];

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

interface Tone {
  wave: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  dur: number;
  gain: number;
}

interface Noise {
  at?: number;
  dur: number;
  gain: number;
  /** Срез фильтра в начале и в конце, Гц. */
  from: number;
  to: number;
}

interface Recipe {
  tones?: Tone[];
  noise?: Noise[];
}

/** Нота: сколько полутонов от ля первой октавы (440 Гц). */
const note = (semitones: number): number => 440 * Math.pow(2, semitones / 12);
const C5 = note(3);
const E5 = note(7);
const G5 = note(10);
const C6 = note(15);
const G4 = note(-2);
const E4 = note(-5);
const C4 = note(-9);

const RECIPES: Record<SfxName, Recipe> = {
  step: { tones: [{ wave: 'sine', from: 520, to: 430, dur: 0.045, gain: 0.05 }] },
  take: { tones: [{ wave: 'triangle', from: 440, to: 700, dur: 0.09, gain: 0.16 }] },
  put: { tones: [{ wave: 'triangle', from: 660, to: 400, dur: 0.1, gain: 0.16 }] },
  miss: {
    tones: [
      { wave: 'sawtooth', from: 170, to: 95, dur: 0.22, gain: 0.13 },
      { wave: 'square', from: 120, to: 80, dur: 0.22, gain: 0.05 },
    ],
  },
  sense: { tones: [{ wave: 'sine', from: 1320, dur: 0.12, gain: 0.07 }] },
  produce: {
    tones: [{ wave: 'square', from: 200, to: 110, dur: 0.07, gain: 0.07 }],
    noise: [{ dur: 0.06, gain: 0.08, from: 2400, to: 600 }],
  },
  deliver: {
    tones: [
      { wave: 'sine', from: 880, dur: 0.16, gain: 0.16 },
      { wave: 'sine', from: 1318.5, at: 0.07, dur: 0.26, gain: 0.16 },
    ],
  },
  deploy: {
    tones: [
      { wave: 'triangle', from: C5, dur: 0.1, gain: 0.14 },
      { wave: 'triangle', from: E5, at: 0.07, dur: 0.1, gain: 0.14 },
      { wave: 'triangle', from: G5, at: 0.14, dur: 0.16, gain: 0.14 },
    ],
  },
  click: { tones: [{ wave: 'sine', from: 880, to: 660, dur: 0.035, gain: 0.1 }] },
  error: {
    tones: [
      { wave: 'square', from: 196, dur: 0.09, gain: 0.08 },
      { wave: 'square', from: 165, at: 0.11, dur: 0.14, gain: 0.08 },
    ],
  },
  countdown: { tones: [{ wave: 'sine', from: 660, dur: 0.16, gain: 0.2 }] },
  launch: {
    tones: [{ wave: 'sawtooth', from: 46, to: 120, dur: 3.2, gain: 0.14 }],
    noise: [{ dur: 3.2, gain: 0.5, from: 280, to: 2600 }],
  },
  win: {
    tones: [
      { wave: 'triangle', from: C5, dur: 0.16, gain: 0.17 },
      { wave: 'triangle', from: E5, at: 0.11, dur: 0.16, gain: 0.17 },
      { wave: 'triangle', from: G5, at: 0.22, dur: 0.16, gain: 0.17 },
      { wave: 'triangle', from: C6, at: 0.33, dur: 0.5, gain: 0.17 },
    ],
  },
  lose: {
    tones: [
      { wave: 'triangle', from: G4, dur: 0.2, gain: 0.15 },
      { wave: 'triangle', from: E4, at: 0.17, dur: 0.2, gain: 0.15 },
      { wave: 'triangle', from: C4, at: 0.34, dur: 0.55, gain: 0.15 },
    ],
  },
  // Авария «линия встала»: два двойных сигнала, как у пульта оператора.
  alarm: {
    tones: [
      { wave: 'square', from: 880, dur: 0.12, gain: 0.06 },
      { wave: 'square', from: 660, at: 0.15, dur: 0.12, gain: 0.06 },
      { wave: 'square', from: 880, at: 0.42, dur: 0.12, gain: 0.06 },
      { wave: 'square', from: 660, at: 0.57, dur: 0.12, gain: 0.06 },
    ],
  },
};

/** Минимальная пауза между одинаковыми звуками, мс. */
const GAPS: Record<string, number> = {
  step: 42,
  take: 30,
  put: 30,
  miss: 70,
  sense: 50,
  produce: 60,
  deliver: 50,
  click: 20,
  alarm: 1500,
};

/** Пентатоника для бипа шага: у каждого дока своя нота, вместе роботы звучат как мелодия, а не как шум. */
const STEP_SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
export const stepRate = (dock: number): number => Math.pow(2, STEP_SCALE[((dock % 8) + 8) % 8] / 12);

const MAX_VOICES = 28;
const MUSIC_LEVEL = 0.55;
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private failed = false;
  private installed = false;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly raw = new Map<string, ArrayBuffer>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private volumes: Volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  private readonly throttle = new Throttle(GAPS, 0);
  private voices = 0;
  private wanted: MusicName | null = null;
  private playing: { name: MusicName; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** Музыка кодом — когда файла музыки нет (так сейчас всегда). */
  private synthMusic: MusicPlayer | null = null;
  private muffled = false;

  /** Положить загруженный звуковой файл. Ключи: sfx_<имя> и music_<имя>. */
  addFile(key: string, data: ArrayBuffer): void {
    this.raw.set(key, data);
    if (this.ctx) void this.decode(key);
  }

  /**
   * Браузер разрешает звук только после первого действия игрока, поэтому аудиоконтекст создаётся
   * на первом нажатии мыши или клавиши, а не при загрузке страницы.
   */
  install(): void {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;
    const unlock = (): void => {
      const ctx = this.ensure();
      if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      this.syncMusic();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('touchstart', unlock, true);
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (document.hidden) void ctx.suspend().catch(() => undefined);
      else void ctx.resume().catch(() => undefined);
    });
  }

  setVolumes(v: Volumes): void {
    this.volumes = { master: v.master, music: v.music, sfx: v.sfx };
    this.applyVolumes();
  }

  /** rate — высота и скорость (1 — как есть), volume — громкость этого звука (1 — как есть). */
  play(name: SfxName, opts: { rate?: number; volume?: number } = {}): void {
    const ctx = this.ctx;
    const out = this.sfxGain;
    if (!ctx || !out || ctx.state !== 'running') return;
    if (this.volumes.master <= 0 || this.volumes.sfx <= 0) return;
    if (name === 'step' && this.voices >= MAX_VOICES) return;
    if (!this.throttle.allow(name, nowMs())) return;
    const rate = opts.rate ?? 1;
    const volume = opts.volume ?? 1;
    const file = this.buffers.get(`sfx_${name}`);
    if (file) {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = file;
      source.playbackRate.value = rate;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(out);
      this.track(source, gain);
      source.start();
      return;
    }
    this.synth(ctx, out, RECIPES[name], rate, volume);
  }

  /** Какая музыка должна играть сейчас; null — тишина. Нет файла — тишина, игра от этого не ломается. */
  music(name: MusicName | null): void {
    this.wanted = name;
    this.syncMusic();
  }

  /** Показ: настоящий мир стоит — музыка глохнет фильтром. */
  setMusicMuffled(on: boolean): void {
    this.muffled = on;
    this.synthMusic?.setMuffled(on);
  }

  /** Отсчёт и старт ракеты: музыка затихает на это время. */
  duckMusic(seconds: number): void {
    this.synthMusic?.duck(seconds);
  }

  private ensure(): AudioContext | null {
    if (this.ctx || this.failed) return this.ctx;
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) {
        this.failed = true;
        return null;
      }
      const ctx = new Ctor();
      this.masterGain = ctx.createGain();
      this.musicGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
      const length = ctx.sampleRate * 2;
      const noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = noise;
      this.synthMusic = new MusicPlayer(ctx, this.musicGain, noise);
      this.synthMusic.setMuffled(this.muffled);
      this.ctx = ctx;
      this.applyVolumes();
      for (const key of this.raw.keys()) void this.decode(key);
    } catch {
      this.failed = true;
      this.ctx = null;
    }
    return this.ctx;
  }

  private applyVolumes(): void {
    if (this.masterGain) this.masterGain.gain.value = this.volumes.master;
    if (this.musicGain) this.musicGain.gain.value = this.volumes.music * MUSIC_LEVEL;
    if (this.sfxGain) this.sfxGain.gain.value = this.volumes.sfx;
  }

  private async decode(key: string): Promise<void> {
    const ctx = this.ctx;
    const data = this.raw.get(key);
    if (!ctx || !data) return;
    this.raw.delete(key);
    try {
      this.buffers.set(key, await ctx.decodeAudioData(data));
      this.syncMusic();
    } catch {
      // Файл не читается как звук — остаётся синтезированный вариант.
    }
  }

  private track(source: AudioScheduledSourceNode, last: AudioNode): void {
    this.voices++;
    source.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      last.disconnect();
    };
  }

  private envelope(gain: GainNode, t: number, dur: number, peak: number): void {
    const g = gain.gain;
    g.setValueAtTime(0.0001, t);
    if (dur < 0.7) {
      g.linearRampToValueAtTime(peak, t + 0.006);
      g.exponentialRampToValueAtTime(0.0001, t + dur);
    } else {
      // Долгий звук (гул ракеты): плавно нарастает, держится и уходит.
      g.linearRampToValueAtTime(peak, t + 0.3);
      g.setValueAtTime(peak, t + dur * 0.6);
      g.linearRampToValueAtTime(0.0001, t + dur);
    }
  }

  private synth(ctx: AudioContext, out: AudioNode, recipe: Recipe, rate: number, volume: number): void {
    const t0 = ctx.currentTime + 0.005;
    for (const tone of recipe.tones ?? []) {
      const t = t0 + (tone.at ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.wave;
      osc.frequency.setValueAtTime(tone.from * rate, t);
      if (tone.to !== undefined) osc.frequency.exponentialRampToValueAtTime(tone.to * rate, t + tone.dur);
      this.envelope(gain, t, tone.dur, tone.gain * volume);
      osc.connect(gain);
      gain.connect(out);
      this.track(osc, gain);
      osc.start(t);
      osc.stop(t + tone.dur + 0.03);
    }
    for (const n of recipe.noise ?? []) {
      if (!this.noiseBuffer) continue;
      const t = t0 + (n.at ?? 0);
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(n.from, t);
      filter.frequency.exponentialRampToValueAtTime(n.to, t + n.dur);
      this.envelope(gain, t, n.dur, n.gain * volume);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      this.track(source, gain);
      source.start(t);
      source.stop(t + n.dur + 0.03);
    }
  }

  private syncMusic(): void {
    const ctx = this.ctx;
    const out = this.musicGain;
    if (!ctx || !out) return;
    const now = ctx.currentTime;
    if (this.playing && this.playing.name !== this.wanted) {
      const old = this.playing;
      this.playing = null;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
      old.source.stop(now + 0.45);
    }
    if (!this.wanted) {
      this.synthMusic?.stop();
      return;
    }
    if (this.playing) return;
    const buffer = this.buffers.get(`music_${this.wanted}`);
    if (!buffer) {
      // Файла нет — музыку играет код.
      this.synthMusic?.play(this.wanted);
      return;
    }
    this.synthMusic?.stop(0.3);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.8);
    source.connect(gain);
    gain.connect(out);
    source.onended = () => gain.disconnect();
    source.start();
    this.playing = { name: this.wanted, source, gain };
  }
}

export const audio = new AudioEngine();
