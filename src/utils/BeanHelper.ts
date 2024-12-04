export interface BeanTypeInterface {
  [key: string | symbol | number]: any;

  start?(): void;

  destroy?(): void;
}

export interface BeanType {
  new (beanHelper: BeanHelper): BeanTypeInterface;
}

export interface ClassInfo<T> {
  name: string;
  class: BeanType;
  instance: T;
  proxy: T;
  proxyRevoke?: () => void;
}

export class BeanHelper {
  private classPool: ClassInfo<any>[] = [];

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
    };

    const handlerMap = {};
    Reflect.ownKeys(Reflect).forEach((key) => {
      handlerMap[key] = (_target: any, ...args: any[]) => {
        if (!classInfo.instance) {
          classInfo.instance = new classInfo.class(this);
          Reflect.ownKeys(classInfo.instance).forEach((k) => (_target[k] = classInfo.instance[k]));
          Reflect.setPrototypeOf(_target, Reflect.getPrototypeOf(classInfo.instance));
        }
        if (key === "set") {
          Reflect[key].apply(Reflect, [_target, args[0], args[1]]);
        } else if (key === "deleteProperty") {
          Reflect[key].apply(Reflect, [_target, args]);
        }
        return Reflect[key].apply(Reflect, [classInfo.instance, ...args]);
      };
    });

    const proxyRevocable = Proxy.revocable({}, handlerMap);
    classInfo.proxy = proxyRevocable.proxy;
    classInfo.proxyRevoke = proxyRevocable.revoke;

    this.classPool.push(classInfo);
    return classInfo.proxy;
  }

  start() {
    this.classPool.forEach((classInfo) => {
      classInfo.proxy.start?.();
    });
  }

  destroy() {
    this.classPool.forEach((classInfo) => {
      if (!classInfo.proxyRevoke) {
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
