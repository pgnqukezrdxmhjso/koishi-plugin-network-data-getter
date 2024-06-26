import path from "node:path";
import fs from "node:fs";

import {Context, HTTP, Session} from "koishi";

import {CmdSource, Config, PlatformResource, ProxyConfig} from "./Config";
import Strings from "./utils/Strings";
import Objects from "./utils/Objects";
import Files from "./utils/Files";
import {formatObjOption, formatOption, OptionInfoMap, PresetPool} from "./Core";


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

function getPlatformHttpClient({ctx, config, session}: {
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

async function handleReqExpert({ctx, config, source, presetPool, session, optionInfoMap, requestConfig,}: {
  ctx: Context,
  config: Config,
  source: CmdSource,
  presetPool: PresetPool,
  session: Session,
  optionInfoMap: OptionInfoMap,
  requestConfig: HTTP.RequestConfig,
}) {
  let expert = source.expert;
  if (!source.expertMode || !expert) {
    return;
  }

  requestConfig.headers = {...(expert.requestHeaders || {})};
  await formatObjOption({
    obj: requestConfig.headers,
    optionInfoMap, session, compelString: true, presetPool
  });

  switch (expert.requestDataType) {
    case "raw": {
      if (Strings.isBlank(expert.requestRaw)) {
        break;
      }
      if (expert.requestJson) {
        requestConfig.data = JSON.parse(expert.requestRaw);
        await formatObjOption({
          obj: requestConfig.data,
          optionInfoMap, session, compelString: false, presetPool
        });
      } else {
        requestConfig.data = await formatOption({
          content: expert.requestRaw, optionInfoMap, session, presetPool
        });
      }
      break;
    }
    case "x-www-form-urlencoded": {
      if (Objects.isEmpty(expert.requestForm)) {
        break;
      }
      requestConfig.data = new URLSearchParams(await formatObjOption({
        obj: {...expert.requestForm},
        optionInfoMap, session, compelString: true, presetPool
      }));
      break;
    }
    case "form-data": {
      if (Objects.isEmpty(expert.requestForm) && Objects.isEmpty(expert.requestFormFiles)) {
        break;
      }
      const form = new FormData();
      requestConfig.data = form;
      const data = await formatObjOption({
        obj: {...(expert.requestForm || {})},
        optionInfoMap, session, compelString: true, presetPool
      });
      for (let key in data) {
        form.append(key, data[key]);
      }

      const fileOverwriteKeys = [];
      for (let key in optionInfoMap.infoMap) {
        const optionInfo = optionInfoMap.infoMap[key];
        const oKey = optionInfo.overwriteKey || key;
        if (
          !optionInfo.autoOverwrite
          || !optionInfo.isFileUrl
          || Strings.isBlank(optionInfo.value + '')
          || typeof expert.requestFormFiles[oKey] === 'undefined'
        ) {
          continue;
        }

        const platformHttpClient = getPlatformHttpClient({ctx, config, session});
        const platformReqConfig: HTTP.RequestConfig = {
          responseType: "blob",
        };
        if (platformHttpClient.config) {
          platformReqConfig.headers = {...(platformHttpClient.config.requestHeaders || {})};
          await formatObjOption({
            obj: platformReqConfig.headers,
            optionInfoMap, session, compelString: true, presetPool
          });
        }
        const fileRes = await platformHttpClient.client('get', optionInfo.value + '', platformReqConfig);

        form.append(oKey, fileRes.data, optionInfo.fileName || await Files.getFileNameByBlob(fileRes.data));
        fileOverwriteKeys.push(oKey);
      }

      for (let key in expert.requestFormFiles) {
        if (fileOverwriteKeys.includes(key)) {
          continue;
        }
        const item = expert.requestFormFiles[key];
        const filePath = path.join(ctx.baseDir, item);
        const fileBlob = new Blob([fs.readFileSync(filePath)]);
        form.append(key, fileBlob, path.parse(filePath).base);
      }
      break;
    }
  }
}

export async function cmdReq({ctx, config, source, presetPool, session, optionInfoMap}: {
  ctx: Context,
  config: Config,
  source: CmdSource,
  presetPool: PresetPool,
  session: Session,
  optionInfoMap: OptionInfoMap
}) {
  const requestConfig: HTTP.RequestConfig = {};
  await handleReqExpert({
    ctx, config, source, presetPool,
    session, optionInfoMap, requestConfig
  });
  const httpClient = getCmdHttpClient({ctx, config, source});
  return await httpClient(
    source.requestMethod,
    await formatOption({content: source.sourceUrl, optionInfoMap, session, presetPool}),
    requestConfig
  );
}


