import { Context } from "koishi";
import path from "node:path";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";

let applyCount = 0;
export default class CoreWeb implements BeanTypeInterface {
  private ctx: Context;

  constructor(beanHelper: BeanHelper) {
    this.ctx = beanHelper.getByName("ctx");

    applyCount++;

    if (applyCount === 1) {
      this.ctx.inject(["console"], (ctx) => {
        const basePath = path.join(path.parse(__filename).dir, "../");
        ctx.console.addEntry({
          dev: path.join(basePath, "/client/index.ts"),
          prod: path.join(basePath, "/dist"),
        });
      });
    }
  }

  destroy() {
    applyCount--;
    if (applyCount < 0) {
      applyCount = 0;
    }
  }
}
