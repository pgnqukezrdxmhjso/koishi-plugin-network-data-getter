import EventEmitter from "node:events";

import { Context } from "koishi";
// noinspection ES6UnusedImports
import {} from "@koishijs/plugin-console";
// noinspection ES6UnusedImports
import {} from "koishi-plugin-umami-statistics-service";
// noinspection ES6UnusedImports
import {} from "koishi-plugin-message-topic-service";
// noinspection ES6UnusedImports
import {} from "koishi-plugin-vercel-satori-png-service";
// noinspection ES6UnusedImports
import {} from "koishi-plugin-cron";
// noinspection ES6UnusedImports
import {} from "@koishijs/cache";
// noinspection ES6UnusedImports
import {} from "koishi-plugin-puppeteer";
import { Config } from "./Config";
import CoreCmd from "./CoreCmd";
import CoreAnonymousStatistics from "./CoreAnonymousStatistics";
import CoreWeb from "./CoreWeb";
import { BeanHelper } from "./utils/BeanHelper";

export const inject = {
  required: ["http", "umamiStatisticsService"],
  optional: ["cron", "cache", "puppeteer", "messageTopicService", "vercelSatoriPngService"],
};

export { Config } from "./Config";
export const name = "network-data-getter";
// noinspection JSUnusedGlobalSymbols
export const reusable = true;
// noinspection JSUnusedGlobalSymbols
export const usage =
  `用法請詳閲 <a target="_blank" href="https://github.com/pgnqukezrdxmhjso/koishi-plugin-network-data-getter#koishi-plugin-network-data-getter">readme.md</a>  \n` +
  "umamiStatisticsService 服務為 umami-statistics-service 插件  \n" +
  "messageTopicService 服務為 message-topic-service 插件  \n" +
  "vercelSatoriPngService 服務為 vercel-satori-png-service 插件";

export interface PluginEventEmitterEventMap {
  never: never;
}

export class PluginEventEmitter extends EventEmitter<PluginEventEmitterEventMap> {}

export function apply(ctx: Context, config: Config) {
  const beanHelper = new BeanHelper();
  beanHelper.put(ctx, "ctx");
  beanHelper.put(config, "config");
  beanHelper.put(new PluginEventEmitter(), "pluginEventEmitter");

  beanHelper.instance(CoreCmd);
  beanHelper.instance(CoreWeb);
  beanHelper.instance(CoreAnonymousStatistics);

  beanHelper.start().catch(ctx.logger.error);

  ctx.on("dispose", () => {
    beanHelper.destroy();
  });
}
