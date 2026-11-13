import { describe, expect, it } from 'vitest';
import { STEP_TICKS, TICK_SECONDS } from '../../types';
import { BEATS_PER_BAR, TRACKS, beatSeconds, midiFreq } from '../music';

describe('музыка кодом', () => {
  it('ноты каждого такта лежат внутри такта, высота и громкость в разумных пределах', () => {
    for (const [name, track] of Object.entries(TRACKS)) {
      for (let bar = 0; bar < track.bars; bar++) {
        const notes = track.bar(bar);
        expect(notes.length, `${name} такт ${bar}`).toBeGreaterThan(0);
        for (const n of notes) {
          expect(n.at).toBeGreaterThanOrEqual(0);
          expect(n.at).toBeLessThan(BEATS_PER_BAR);
          expect(n.dur).toBeGreaterThan(0);
          expect(n.gain).toBeGreaterThan(0);
          expect(n.gain).toBeLessThanOrEqual(0.2);
          if (n.voice !== 'kick' && n.voice !== 'hat') {
            expect(midiFreq(n.midi)).toBeGreaterThan(40);
            expect(midiFreq(n.midi)).toBeLessThan(2000);
          }
        }
      }
    }
  });

  it('круг повторяется: такт N и N + длина круга одинаковые', () => {
    for (const track of Object.values(TRACKS)) {
      for (let bar = 0; bar < track.bars; bar++) expect(track.bar(bar + track.bars)).toEqual(track.bar(bar));
    }
  });

  it('на линии восьмая нота длится ровно шаг робота (0,25 с), бочка — на первую и третью долю', () => {
    const shift = TRACKS.shift;
    expect(beatSeconds(shift.bpm) / 2).toBeCloseTo(STEP_TICKS * TICK_SECONDS, 9);
    const kicks = shift.bar(0).filter((n) => n.voice === 'kick').map((n) => n.at);
    expect(kicks).toEqual([0, 2]);
  });

  it('ля первой октавы — 440 Гц', () => {
    expect(midiFreq(69)).toBe(440);
    expect(midiFreq(81)).toBeCloseTo(880, 9);
  });
});
