const Arrays = {
  isEmpty(arr: any[]): boolean {
    return !arr || arr.length === 0;
  },
  isNotEmpty(arr: any[]) {
    return !Arrays.isEmpty(arr);
  },
};

export default Arrays;
