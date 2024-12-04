import Strings from "./Strings";

const Objects = {
  isNull(obj: any) {
    return obj === null || typeof obj === "undefined";
  },
  isNotNull(obj: any) {
    return !Objects.isNull(obj);
  },
  isEmpty(obj: any) {
    return Objects.isNull(obj) || Object.keys(obj).length < 1;
  },
  isNotEmpty(obj: any) {
    return !Objects.isEmpty(obj);
  },
  async thoroughForEach(
    obj: any,
    fn: (value: any, key: string, obj: any, keys: string[], root: any) => Promise<void>,
    keys: string[] = [],
    root?: any,
  ) {
    if (!root) {
      root = obj;
    }
    for (const key in obj) {
      const value = obj[key];
      if (value instanceof Object) {
        await Objects.thoroughForEach(value, fn, [...keys, key], root);
      } else {
        await fn(value, key, obj, keys, root);
      }
    }
  },
  flatten(data: any, rootElements: any[] = []): any[] {
    if (data === undefined || data === null) {
      return;
    }
    if (data instanceof Object) {
      for (const key in data) {
        Objects.flatten(data[key], rootElements);
      }
    } else {
      rootElements.push(data);
    }
    return rootElements;
  },
  getValue(obj: any, key: string): any {
    let target = obj;
    key.split("[]").forEach((key, index) => {
      if (Strings.isBlank(key)) {
        return;
      }
      const get = Function("obj", "return obj" + (/^(\??\.|\[)/.test(key) ? "" : ".") + key);
      if (index === 0) {
        target = get(target);
      } else {
        const nList = [];
        for (const k in target) {
          const t = get(target[k]);
          if (Objects.isNull(t)) {
            continue;
          }
          if (Array.isArray(t)) {
            nList.push(...t);
          } else {
            nList.push(t);
          }
        }
        target = nList;
      }
    });
    return target;
  },
};

export default Objects;
