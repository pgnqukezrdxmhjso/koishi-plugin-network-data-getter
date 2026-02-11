import path from "node:path";
import { BeanHelper } from "koishi-plugin-rzgtboeyndxsklmq-commons";
import { Config } from "./Config";

let applyCount = 0;
export default class CoreWeb extends BeanHelper.BeanType<Config> {
  start() {
    applyCount++;

    if (applyCount === 1) {
      this.ctx.inject(["console"], (ctx) => {
        let prod = path.resolve(__dirname, "../dist");
        if (prod.includes("external") && !prod.includes("node_modules")) {
          prod = path.join(ctx.baseDir, "node_modules/koishi-plugin-network-data-getter/dist");
        }
        ctx.console.addEntry({
          dev: path.resolve(__dirname, "../client/index.ts"),
          prod,
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
