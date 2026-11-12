// Номера роботов в подписях («Робот 2»). id робота в симуляции растёт с каждым новым роботом, поэтому
// после копий и перезаписей подпись «Робот 7» при двух роботах сбивала бы с толку. Здесь номер — самый
// маленький свободный: он держится, пока робот жив, а перезаписанный робот получает номер прежнего.
// Цвет робота симуляция выбирает так же (первый свободный), поэтому номер совпадает с порядком цветов.

export class RobotNumbers {
  private readonly byId = new Map<number, number>();

  /** Обновить по списку живых роботов (порядок — как в снимке, то есть по времени появления). */
  sync(ids: readonly number[]): void {
    if (ids.length === this.byId.size && ids.every((id) => this.byId.has(id))) return;
    const alive = new Set(ids);
    for (const id of [...this.byId.keys()]) if (!alive.has(id)) this.byId.delete(id);
    const used = new Set(this.byId.values());
    for (const id of ids) {
      if (this.byId.has(id)) continue;
      let n = 1;
      while (used.has(n)) n++;
      this.byId.set(id, n);
      used.add(n);
    }
  }

  /** Номер робота для подписи. */
  of(id: number): number {
    return this.byId.get(id) ?? id + 1;
  }
}
