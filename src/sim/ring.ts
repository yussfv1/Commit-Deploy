/**
 * Кольцевой буфер битов: какую долю последних `size` тиков условие было истинным.
 * На нём считается загрузка машин (телеметрия). Память фиксированная, добавление — O(1).
 */
export class BitRing {
  readonly size: number;
  private readonly bits: Uint8Array;
  private pos = 0;
  private sum = 0;
  private count = 0;

  constructor(size: number) {
    this.size = size;
    this.bits = new Uint8Array(size);
  }

  push(on: boolean): void {
    const bit = on ? 1 : 0;
    this.sum += bit - this.bits[this.pos];
    this.bits[this.pos] = bit;
    this.pos = (this.pos + 1) % this.size;
    if (this.count < this.size) this.count++;
  }

  /** Доля истинных значений, 0..1. */
  get share(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }

  /** Сколько значений уже накоплено (не больше size). */
  get samples(): number {
    return this.count;
  }

  /** Строка из '0' и '1' от старых значений к новым — для сохранения. */
  encode(): string {
    const start = this.count < this.size ? 0 : this.pos;
    let out = '';
    for (let i = 0; i < this.count; i++) {
      out += this.bits[(start + i) % this.size] === 1 ? '1' : '0';
    }
    return out;
  }

  static decode(size: number, encoded: string): BitRing {
    const ring = new BitRing(size);
    for (let i = 0; i < encoded.length; i++) ring.push(encoded.charCodeAt(i) === 49);
    return ring;
  }
}
