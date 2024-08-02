import {Context, Dict, HTTP, Session} from "koishi";
import {CmdSource, Config, PlatformResource, ProxyConfig} from "./Config";
import Strings from "./utils/Strings";
import {CmdCtx, formatObjOption} from "./Core";
import Objects from "./utils/Objects";

interface PlatformHttpClient {
  client: HTTP;
  config?: PlatformResource
}

function buildHttpClient({ctx, proxyConfig}: {
  ctx: Context,
  proxyConfig: ProxyConfig,
}): HTTP {
  switch (proxyConfig.proxyType) {
    case "NONE": {
      return ctx.http.extend({
        timeout: proxyConfig.timeout,
        ...{proxyAgent: undefined}
      });
    }
    case "MANUAL": {
      return ctx.http.extend({
        timeout: proxyConfig.timeout,
        ...{proxyAgent: proxyConfig.proxyAgent}
      });
    }
    case "GLOBAL":
    default: {
      return ctx.http;
    }
  }
}

export function getCmdHttpClient({ctx, config, source}: {
  ctx: Context,
  config: Config,
  source: CmdSource,
}): HTTP {
  const proxyConfig: ProxyConfig = (config.expertMode && config.expert) ? config.expert : {proxyType: 'GLOBAL'};
  let cmdHttpClient: HTTP = buildHttpClient({ctx, proxyConfig});
  if (!source.expertMode || Strings.isBlank(source.expert?.proxyAgent)) {
    return cmdHttpClient;
  }
  return cmdHttpClient.extend({
    ...{proxyAgent: source.expert.proxyAgent} as any
  });
}

export function getPlatformHttpClient({ctx, config, session}: {
  ctx: Context,
  config: Config,
  session: Session,
}): PlatformHttpClient {
  if (!config.expertMode) {
    return {client: ctx.http};
  }
  const platformResource =
    config.expert?.platformResourceList?.find(platformResource => platformResource.name === session.platform);
  if (!platformResource) {
    return {client: ctx.http};
  }
  return {
    client: buildHttpClient({ctx, proxyConfig: platformResource}),
    config: platformResource
  };
}

export async function loadUrl(
  args: CmdCtx & {
    isPlatform: boolean
    url: string,
    reqConfig?: HTTP.RequestConfig
  }
) {
  let {
    isPlatform, url, reqConfig,
    ctx, config, source,
    presetPool, session, optionInfoMap
  } = args;
  let headers: Dict<string> = {};
  let httpClient: HTTP;
  if (!isPlatform) {
    httpClient = getCmdHttpClient({ctx, config, source});
  } else {
    let platformHttpClient = getPlatformHttpClient({ctx, config, session});
    httpClient = platformHttpClient.client;
    if (Objects.isNotEmpty(platformHttpClient?.config?.requestHeaders)) {
      headers = {...headers, ...platformHttpClient.config.requestHeaders};
    }
  }
  if (Objects.isNotEmpty(reqConfig?.headers)) {
    headers = {...headers, ...reqConfig.headers};
  }
  if (Objects.isNotEmpty(headers)) {
    await formatObjOption({
      ...args,
      obj: headers,
      compelString: true,
    });
  }
  if (!reqConfig) {
    reqConfig = {};
  }
  reqConfig.headers = {
    Referer: new URL(url).origin,
    ...headers
  }
  return await httpClient('get', url, reqConfig);
}

export async function urlToBase64(
  args: CmdCtx & {
    isPlatform: boolean
    url: string,
    reqConfig?: HTTP.RequestConfig
  }
) {
  const res = await loadUrl(args);
  return `data:${res.headers.get('Content-Type')};base64,` + Buffer.from(res.data).toString('base64');
}
