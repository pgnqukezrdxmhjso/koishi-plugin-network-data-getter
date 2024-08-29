import { List } from "@satorijs/protocol";
import { logger } from "../logger";

const KoishiUtil = {
  async forList<S>(
    forFn: (item: S) => Promise<boolean | void> | boolean | void,
    that: any,
    listFn: (...args: any[]) => Promise<List<S>>,
    ...args: any[]
  ) {
    let next: string;
    do {
      let res: List<S>;
      try {
        res = await listFn.apply(that, [...args, next]);
      } catch (e) {
        logger.error(e);
        return;
      }
      next = res.next;
      if (!(res.data instanceof Array)) {
        return;
      }
      for (const item of res.data) {
        if ((await forFn(item)) === false) {
          return;
        }
      }
    } while (next);
  },
};

export default KoishiUtil;
