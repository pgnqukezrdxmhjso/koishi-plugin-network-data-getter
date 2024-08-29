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
};

export default Objects;
