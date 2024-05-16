const Strings = {
  isEmpty(str: string): boolean {
    return !str;
  },
  isNotEmpty(str: string): boolean {
    return !Strings.isEmpty(str);
  },
  isBlank(str: string): boolean {
    return Strings.isEmpty(str) || str.trim().length === 0;
  },
  isNotBlank(str: string): boolean {
    return !Strings.isBlank(str);
  },
}

export default Strings;
