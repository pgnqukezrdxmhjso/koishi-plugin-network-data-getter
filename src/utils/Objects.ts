const Objects = {
  isNull(obj: any) {
    return obj === null || typeof obj === 'undefined';
  },
  isNotNull(obj: any) {
    return !Objects.isNull(obj);
  },
  thoroughForEach(obj: any, fn: (value: any, key: string, obj: any, keys: string[], root: any) => void, keys: string[] = [], root?: any) {
    if (!root) {
      root = obj;
    }
    for (let key in obj) {
      const value = obj[key];
      if (value instanceof Object) {
        Objects.thoroughForEach(value, fn, [...keys, key], root);
      } else {
        fn(value, key, obj, keys, root);
      }
    }
  }
};

export default Objects;
