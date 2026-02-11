import { Dict, HTTP } from "koishi";
import { BeanHelper, Strings, Objects } from "koishi-plugin-rzgtboeyndxsklmq-commons";

import { CmdSource, Config, PlatformResource, ProxyConfig } from "./Config";
import { CmdCtx } from "./CoreCmd";
import CmdCommon from "./CmdCommon";

interface PlatformHttpClient {
  client: HTTP;
  config?: PlatformResource;
}

export default class CmdHttp extends BeanHelper.BeanType<Config> {
  private cmdCommon = this.beanHelper.instance(CmdCommon);

  private buildHttpClient(proxyConfig: ProxyConfig): HTTP {
    switch (proxyConfig.proxyType) {
      case "NONE": {
        return this.ctx.http.extend({
          timeout: proxyConfig.timeout,
          ...{ proxyAgent: undefined },
        });
      }
      case "MANUAL": {
        return this.ctx.http.extend({
          timeout: proxyConfig.timeout,
          ...{ proxyAgent: proxyConfig.proxyAgent },
        });
      }
      case "GLOBAL":
      default: {
        return this.ctx.http;
      }
    }
  }

  getCmdHttpClient(source: CmdSource): HTTP {
    const proxyConfig: ProxyConfig =
      this.config.expertMode && this.config.expert ? this.config.expert : { proxyType: "GLOBAL" };
    const cmdHttpClient: HTTP = this.buildHttpClient(proxyConfig);
    if (!source.expertMode || Strings.isBlank(source.expert?.proxyAgent)) {
      return cmdHttpClient;
    }
    return cmdHttpClient.extend({
      ...({ proxyAgent: source.expert.proxyAgent } as any),
    });
  }

  getPlatformHttpClient(platform: string): PlatformHttpClient {
    if (!this.config.expertMode) {
      return { client: this.ctx.http };
    }
    const platformResource = this.config.expert?.platformResourceList?.find(
      (platformResource) => platformResource.name === platform,
    );
    if (!platformResource) {
      return { client: this.ctx.http };
    }
    return {
      client: this.buildHttpClient(platformResource),
      config: platformResource,
    };
  }

  async loadUrl(cmdCtx: CmdCtx, url: string, reqConfig?: HTTP.RequestConfig) {
    let headers: Dict<string> = {};
    let httpClient: HTTP;
    let isPlatform = false;
    for (const key in cmdCtx.optionInfoMap.infoMap) {
      const info = cmdCtx.optionInfoMap.infoMap[key];
      if (info.isFileUrl && info.value === url) {
        isPlatform = true;
        break;
      }
    }

    if (!isPlatform) {
      httpClient = this.getCmdHttpClient(cmdCtx.source);
    } else {
      const platformHttpClient = this.getPlatformHttpClient(cmdCtx.smallSession.platform);
      httpClient = platformHttpClient.client;
      if (Objects.isNotEmpty(platformHttpClient?.config?.requestHeaders)) {
        headers = { ...headers, ...platformHttpClient.config.requestHeaders };
      }
    }

    if (Objects.isNotEmpty(reqConfig?.headers)) {
      headers = { ...headers, ...reqConfig.headers };
    }
    if (Objects.isNotEmpty(headers)) {
      await this.cmdCommon.formatObjOption(cmdCtx, headers, true);
    }
    if (!reqConfig) {
      reqConfig = {};
    }
    reqConfig.headers = {
      Referer: new URL(url).origin,
      ...headers,
    };
    return await httpClient("get", url, reqConfig);
  }

  async urlToBase64(cmdCtx: CmdCtx, url: string, reqConfig?: HTTP.RequestConfig) {
    const res = await this.loadUrl(cmdCtx, url, reqConfig);
    return `data:${res.headers.get("Content-Type")};base64,` + Buffer.from(res.data).toString("base64");
  }
}
