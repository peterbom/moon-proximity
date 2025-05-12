export type Cleaner = {
  clean(): void;
};

export class Cleanup {
  private readonly cleaners: Cleaner[] = [];

  public add(cleaner: Cleaner) {
    this.cleaners.push(cleaner);
  }

  public clean() {
    this.cleaners.forEach((c) => c.clean());
    this.cleaners.length = 0;
  }
}
