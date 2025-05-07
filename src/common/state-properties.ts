export class DelayedProperty<T> {
  private readonly promise: Promise<T>;
  private resolve: (value: T | PromiseLike<T>) => void;
  private reject: (reason?: any) => void;
  constructor() {
    this.resolve = () => {};
    this.reject = () => {};
    const self = this;
    this.promise = new Promise((resolve, reject) => {
      self.resolve = resolve;
      self.reject = reject;
    });
  }

  public setValue(result: T) {
    this.resolve(result);
  }

  public fail(reason: any) {
    this.reject(reason);
  }

  public getValue(): Promise<T> {
    return this.promise;
  }
}

export class NotifiableProperty<T> {
  private readonly eventTarget = new EventTarget();
  constructor(private value: T) {}

  public getValue(): T {
    return this.value;
  }

  public setValue(value: T) {
    this.value = value;
    this.eventTarget.dispatchEvent(new Event("updated"));
  }

  public subscribe(handler: (value: T) => void) {
    const self = this;
    this.eventTarget.addEventListener("updated", () => handler(self.value));
  }
}
