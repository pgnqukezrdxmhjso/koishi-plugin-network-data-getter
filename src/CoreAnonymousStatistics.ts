import { Context } from "koishi";
import { Config } from "./Config";
import { PluginEventEmitter } from "./index";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";

const dataHostUrl: string = "https://data.itzdrli.cc";
const website: string = "a7f48881-235d-4ddd-821a-029993ef32e9";

export default class CoreAnonymousStatistics implements BeanTypeInterface {
  private ctx: Context;
  private config: Config;
  private pluginEventEmitter: PluginEventEmitter;
  private lastUmami: number = 0;

  constructor(beanHelper: BeanHelper) {
    this.ctx = beanHelper.getByName("ctx");
    this.config = beanHelper.getByName("config");
    this.pluginEventEmitter = beanHelper.getByName("pluginEventEmitter");

    if (!this.config.anonymousStatistics) {
      return;
    }
    this.onCmdAction();
    this.pluginReady();
  }

  private async send({
    url = "/",
    urlSearchParams = {},
    title,
    eventName,
    data,
  }: {
    url?: string;
    urlSearchParams?: Record<string, any>;
    title?: string;
    eventName?: string;
    data?: Record<string, any>;
  }) {
    urlSearchParams.uid = this.ctx.scope.uid;
    return this.ctx.umamiStatisticsService.send({
      dataHostUrl,
      website,
      url,
      urlSearchParams,
      title,
      eventName,
      data,
    });
  }

  private pluginReady() {
    this.send({
      url: "plugin_ready",
    }).then();
  }

  private onCmdAction() {
    this.pluginEventEmitter.on("cmd-action", () => {
      if (Date.now() - this.lastUmami > 24 * 60 * 60 * 1000) {
        this.lastUmami = Date.now();
        this.send({
          url: "cmd_action",
        }).then();
      }
    });
  }
}
