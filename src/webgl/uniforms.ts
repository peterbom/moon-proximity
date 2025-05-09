import { UniformName, UniformValues } from "./program-types";

type UniformValueGetters<TValues extends UniformValues, TSupplied extends UniformName<TValues>, TContext, TObject> = {
  [TName in TSupplied]: (ctx: TContext, obj: TObject) => TValues[TName];
};

export class UniformCollector<
  TValues extends UniformValues,
  TSupplied extends UniformName<TValues> = never,
  TContext = undefined,
  TObject = undefined
> {
  constructor(
    private readonly perSceneUniforms: TSupplied[],
    private readonly perObjectUniforms: TSupplied[],
    private readonly getters: UniformValueGetters<TValues, TSupplied, TContext, TObject>
  ) {}

  static create<TValues extends UniformValues, TContext = undefined, TObject = undefined>(): UniformCollector<
    TValues,
    never,
    TContext,
    TObject
  > {
    return new UniformCollector([], [], {});
  }

  public withObjectUniform<TName extends UniformName<Omit<TValues, TSupplied>>>(
    name: TName,
    getter: (ctx: TContext, obj: TObject) => TValues[TName]
  ): UniformCollector<TValues, TSupplied | TName, TContext, TObject> {
    return new UniformCollector(this.perSceneUniforms, [...this.perObjectUniforms, name], {
      ...this.getters,
      [name]: getter,
    } as UniformValueGetters<TValues, TSupplied | TName, TContext, TObject>);
  }

  public withObjectUniforms<TNames extends UniformName<Omit<TValues, TSupplied>>>(getters: {
    [TName in TNames]: (ctx: TContext, obj: TObject) => TValues[TName];
  }): UniformCollector<TValues, TSupplied | TNames, TContext, TObject> {
    return new UniformCollector(
      this.perSceneUniforms,
      [...this.perObjectUniforms, ...(Object.keys(getters) as TNames[])],
      {
        ...this.getters,
        ...getters,
      } as UniformValueGetters<TValues, TSupplied | TNames, TContext, TObject>
    );
  }

  public withSceneUniform<TName extends UniformName<Omit<TValues, TSupplied>>>(
    name: TName,
    getter: (ctx: TContext) => TValues[TName]
  ): UniformCollector<TValues, TSupplied | TName, TContext, TObject> {
    return new UniformCollector([...this.perSceneUniforms, name], this.perObjectUniforms, {
      ...this.getters,
      [name]: getter,
    } as UniformValueGetters<TValues, TSupplied | TName, TContext, TObject>);
  }

  public withSceneUniforms<TNames extends UniformName<Omit<TValues, TSupplied>>>(getters: {
    [TName in TNames]: (ctx: TContext) => TValues[TName];
  }): UniformCollector<TValues, TSupplied | TNames, TContext, TObject> {
    return new UniformCollector(
      [...this.perSceneUniforms, ...(Object.keys(getters) as TNames[])],
      this.perObjectUniforms,
      {
        ...this.getters,
        ...getters,
      } as UniformValueGetters<TValues, TSupplied | TNames, TContext, TObject>
    );
  }

  public getPerSceneUniforms(ctx: TContext): Partial<TValues> {
    const self = this;
    const entries = this.perSceneUniforms.map((name) => [name, self.getters[name](ctx, undefined as TObject)]);
    return Object.fromEntries(entries);
  }

  public getPerObjectUniforms(ctx: TContext, obj: TObject): Partial<TValues> {
    const self = this;
    const entries = this.perObjectUniforms.map((name) => [name, self.getters[name](ctx, obj)]);
    return Object.fromEntries(entries);
  }
}
