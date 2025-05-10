import type { UniformName, UniformSetters, UniformValues } from "./program-types";

type PerSceneGetter<TValues extends UniformValues, TContext> = (ctx: TContext) => Partial<TValues>;
type PerObjectGetter<TValues extends UniformValues, TContext, TObject> = (
  ctx: TContext,
  obj: TObject
) => Partial<TValues>;

export class UniformCollector<
  TValues extends UniformValues,
  TSupplied extends UniformName<TValues> = never,
  TContext = undefined,
  TObject = undefined
> {
  private constructor(
    //private readonly perSceneUniforms: TSupplied[],
    //private readonly perObjectUniforms: TSupplied[],
    private readonly perSceneGetter: PerSceneGetter<TValues, TContext>,
    private readonly perObjectGetter: PerObjectGetter<TValues, TContext, TObject>
  ) {}

  static create<TValues extends UniformValues, TContext = undefined, TObject = undefined>(): UniformCollector<
    TValues,
    never,
    TContext,
    TObject
  > {
    return new UniformCollector(
      () => ({}),
      () => ({})
    );
  }

  public withSceneUniform<TName extends UniformName<Omit<TValues, TSupplied>>>(
    name: TName,
    getter: (ctx: TContext) => TValues[TName]
  ): UniformCollector<TValues, TSupplied | TName, TContext, TObject> {
    const updatedGetter = (ctx: TContext) => ({
      ...this.perSceneGetter(ctx),
      [name]: getter(ctx),
    });
    return new UniformCollector(updatedGetter, this.perObjectGetter);
  }

  public withSceneUniforms<TNames extends UniformName<Omit<TValues, TSupplied>>>(
    getter: (ctx: TContext) => {
      [TName in TNames]: TValues[TName];
    }
  ): UniformCollector<TValues, TSupplied | TNames, TContext, TObject> {
    const updatedGetter = (ctx: TContext) => ({
      ...this.perSceneGetter(ctx),
      ...getter(ctx),
    });
    return new UniformCollector(updatedGetter, this.perObjectGetter);
  }

  public withObjectUniform<TName extends UniformName<Omit<TValues, TSupplied>>>(
    name: TName,
    getter: (ctx: TContext, obj: TObject) => TValues[TName]
  ): UniformCollector<TValues, TSupplied | TName, TContext, TObject> {
    const updatedGetter = (ctx: TContext, obj: TObject) => ({
      ...this.perObjectGetter(ctx, obj),
      [name]: getter(ctx, obj),
    });
    return new UniformCollector(this.perSceneGetter, updatedGetter);
  }

  public withObjectUniforms<TNames extends UniformName<Omit<TValues, TSupplied>>>(
    getter: (
      ctx: TContext,
      obj: TObject
    ) => {
      [TName in TNames]: TValues[TName];
    }
  ): UniformCollector<TValues, TSupplied | TNames, TContext, TObject> {
    const updatedGetter = (ctx: TContext, obj: TObject) => ({
      ...this.perObjectGetter(ctx, obj),
      ...getter(ctx, obj),
    });
    return new UniformCollector(this.perSceneGetter, updatedGetter);
  }

  public getPerSceneUniforms(ctx: TContext): Partial<TValues> {
    return this.perSceneGetter(ctx);
  }

  public getPerObjectUniforms(ctx: TContext, obj: TObject): Partial<TValues> {
    return this.perObjectGetter(ctx, obj);
  }
}

export function setUniforms<T extends UniformValues>(setters: UniformSetters<T>, values: Partial<T>) {
  Object.entries(values).forEach(([name, value]) => {
    const setter = setters[name];
    if (setter) {
      setter(value);
    } else {
      // Not an error. It's okay to specify values for uniforms that don't exist, such as when we use
      // more than one program, or unused uniforms within a program have been optimized out.
      console.info(`Missing setter for uniform: ${name}`);
    }
  });
}
