export interface BeanTypeInterface {
  [key: string | symbol | number]: any;

  start?(): void | Promise<void>;

  destroy?(): void;
}

const BeanHelperInstanceSymbol = Symbol("BeanHelperInstance");
export interface BeanType {
  new (beanHelper: BeanHelper): BeanTypeInterface;
}
export interface ClassInfo<T> {
  name: string;
  class: BeanType;
  instance: T;
  proxy: T;
  proxyRevoke?: () => void;
  [BeanHelperInstanceSymbol]?: boolean;
}

export class BeanHelper {
  private classPool: ClassInfo<any>[] = [];

  static buildLazyProxyHandler(getObj: () => any) {
    const handlerMap = {};
    let needInit = true;
    Reflect.ownKeys(Reflect).forEach((key) => {
      handlerMap[key] = (target: any, ...args: any[]) => {
        const obj = getObj();
        if (needInit) {
          needInit = false;
          Reflect.ownKeys(obj).forEach((k) => (target[k] = obj[k]));
          Reflect.setPrototypeOf(target, Reflect.getPrototypeOf(obj));
        }
        if (key === "set") {
          Reflect[key].apply(Reflect, [target, args[0], args[1]]);
        } else if (key === "deleteProperty") {
          Reflect[key].apply(Reflect, [target, args]);
        }
        let res = Reflect[key].apply(Reflect, [obj, ...args]);
        if (key === "get" && typeof res === "function") {
          res = res.bind(obj);
        }
        return res;
      };
    });
    return handlerMap;
  }

  static buildLazyProxy(getObj: () => any) {
    return new Proxy({}, BeanHelper.buildLazyProxyHandler(getObj));
  }

  instance<T extends BeanType>(clazz: T): InstanceType<T> {
    let classInfo = this.classPool.find((classInfo) => classInfo.class === clazz);
    if (classInfo) {
      return classInfo.proxy;
    }
    classInfo = {
      name: clazz.name,
      class: clazz,
      instance: null,
      proxy: null,
      proxyRevoke: null,
      [BeanHelperInstanceSymbol]: true,
    };

    const handlerMap = BeanHelper.buildLazyProxyHandler(() => {
      if (!classInfo.instance) {
        classInfo.instance = new classInfo.class(this);
      }
      return classInfo.instance;
    });

    const proxyRevocable = Proxy.revocable({}, handlerMap);
    classInfo.proxy = proxyRevocable.proxy;
    classInfo.proxyRevoke = proxyRevocable.revoke;

    this.classPool.push(classInfo);
    return classInfo.proxy;
  }

  private touchAll() {
    let i = 0;
    let len = 0;
    while (len != this.classPool.length && i++ < 99999) {
      len = this.classPool.length;
      this.classPool.forEach((classInfo) => {
        if (!classInfo[BeanHelperInstanceSymbol]) {
          return;
        }
        return classInfo?.proxy?.["__"];
      });
    }
  }

  async start() {
    this.touchAll();
    for (const classInfo of this.classPool) {
      if (!classInfo[BeanHelperInstanceSymbol]) {
        continue;
      }
      await classInfo.proxy.start?.();
    }
  }

  destroy() {
    this.classPool.forEach((classInfo) => {
      if (!classInfo[BeanHelperInstanceSymbol]) {
        return;
      }
      classInfo.proxy.destroy?.();
      for (const key in classInfo.instance) {
        delete classInfo.instance[key];
      }
      classInfo.proxyRevoke();
    });
    this.classPool = null;
  }

  getByName<T>(name: string): T {
    return this.classPool.find((classInfo) => classInfo.name === name)?.instance;
  }

  put<T>(instance: T, name?: string, clazz?: BeanType) {
    if (!clazz) {
      clazz = instance.constructor as any;
    }
    if (!name) {
      name = clazz.name;
    }
    this.classPool.push({
      name: name,
      class: clazz,
      instance: instance,
      proxy: instance,
    });
    return instance;
  }
}
