import { BeanHelper } from "koishi-plugin-rzgtboeyndxsklmq-commons";

import { Config } from "./Config";
import { PluginEventEmitter } from "./index";

const dataHostUrl: string = "https://data.itzdrli.cc";
const website: string = "a7f48881-235d-4ddd-821a-029993ef32e9";

export default class CoreAnonymousStatistics extends BeanHelper.BeanType<Config> {
  private pluginEventEmitter: PluginEventEmitter = this.beanHelper.getByName("pluginEventEmitter");
  private lastUmami: number = 0;

  constructor(beanHelper: BeanHelper<Config>) {
    super(beanHelper);
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
