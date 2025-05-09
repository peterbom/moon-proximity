export class IdGenerator {
  private id: number;

  constructor(startId: number) {
    this.id = startId;
  }

  getNextId(): number {
    return this.id++;
  }
}
