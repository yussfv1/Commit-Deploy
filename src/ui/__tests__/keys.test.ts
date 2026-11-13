import { describe, expect, it } from 'vitest';
import { once } from '../keys';

describe('клавиши: каждое нажатие один раз', () => {
  it('Phaser прогоняет очередь кадра заново — повторное то же событие не проходит', () => {
    const got: string[] = [];
    const handler = once((ev) => got.push(ev.code));
    const left = { code: 'ArrowLeft' } as KeyboardEvent;
    const up = { code: 'ArrowUp' } as KeyboardEvent;
    // Как в Phaser 3.90: на каждое новое событие обрабатывается вся очередь кадра [left] → [left, up] → [left, up].
    for (const queue of [[left], [left, up], [left, up]]) for (const ev of queue) handler(ev);
    expect(got).toEqual(['ArrowLeft', 'ArrowUp']);
  });

  it('новое нажатие той же клавиши — новое событие, оно проходит', () => {
    const got: string[] = [];
    const handler = once((ev) => got.push(ev.code));
    handler({ code: 'KeyE' } as KeyboardEvent);
    handler({ code: 'KeyE' } as KeyboardEvent);
    expect(got).toEqual(['KeyE', 'KeyE']);
  });
});
