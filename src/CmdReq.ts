import path from "node:path";
import fs from "node:fs";

import { HTTP } from "koishi";
import Strings from "./utils/Strings";
import Objects from "./utils/Objects";
import Files from "./utils/Files";
import { CmdCtx, formatObjOption, formatOption } from "./Core";
import { getCmdHttpClient, loadUrl } from "./Http";
import { debugInfo } from "./logger";

async function handleReqExpert(
  args: CmdCtx & {
    requestConfig: HTTP.RequestConfig;
  },
) {
  const { ctx, source, optionInfoMap, requestConfig } = args;

  const expert = source.expert;
  if (!source.expertMode || !expert) {
    return;
  }

  requestConfig.headers = { ...(expert.requestHeaders || {}) };
  await formatObjOption({
    ...args,
    obj: requestConfig.headers,
    compelString: true,
  });

  switch (expert.requestDataType) {
    case "raw": {
      if (Strings.isBlank(expert.requestRaw)) {
        break;
      }
      if (expert.requestJson) {
        requestConfig.data = JSON.parse(expert.requestRaw);
        await formatObjOption({
          ...args,
          obj: requestConfig.data,
          compelString: false,
        });
      } else {
        requestConfig.data = await formatOption({ ...args, content: expert.requestRaw });
      }
      break;
    }
    case "x-www-form-urlencoded": {
      if (Objects.isEmpty(expert.requestForm)) {
        break;
      }
      requestConfig.data = new URLSearchParams(
        await formatObjOption({
          ...args,
          obj: { ...expert.requestForm },
          compelString: true,
        }),
      );
      break;
    }
    case "form-data": {
      if (Objects.isEmpty(expert.requestForm) && Objects.isEmpty(expert.requestFormFiles)) {
        break;
      }
      const form = new FormData();
      requestConfig.data = form;
      const data = await formatObjOption({
        ...args,
        obj: { ...(expert.requestForm || {}) },
        compelString: true,
      });
      for (const key in data) {
        form.append(key, data[key]);
      }

      const fileOverwriteKeys = [];
      for (const key in optionInfoMap.infoMap) {
        const optionInfo = optionInfoMap.infoMap[key];
        const oKey = optionInfo.overwriteKey || key;
        if (
          !optionInfo.autoOverwrite ||
          !optionInfo.isFileUrl ||
          Strings.isBlank(optionInfo.value + "") ||
          typeof expert.requestFormFiles[oKey] === "undefined"
        ) {
          continue;
        }

        const fileRes = await loadUrl({
          ...args,
          url: optionInfo.value as string,
          reqConfig: {
            responseType: "blob",
          },
        });

        form.append(oKey, fileRes.data, optionInfo.fileName || (await Files.getFileNameByBlob(fileRes.data)));
        fileOverwriteKeys.push(oKey);
      }

      for (const key in expert.requestFormFiles) {
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

function reqDataToJson(data: any) {
  if (!data) {
    return data;
  }
  if (data instanceof FormData) {
    const newData = {};
    for (const datum of data) {
      const [key, value] = datum;
      if (value instanceof Blob) {
        newData[key] = value.name;
      } else {
        newData[key] = value;
      }
    }
    return newData;
  }
  if (data instanceof URLSearchParams) {
    return data.toString();
  }
  return data;
}

function reqLog(cmdCtx: CmdCtx, url: string, requestConfig: HTTP.RequestConfig) {
  debugInfo(cmdCtx, () => {
    const rc = { ...requestConfig };
    rc.data = reqDataToJson(rc.data);
    return (
      `cmdNetReq; ${cmdCtx.session.content}\n` +
      `url: ${url}\n` +
      `method: ${cmdCtx.source.requestMethod}\n` +
      `config: ${JSON.stringify(rc, null, 2)}`
    );
  });
}

export async function cmdReq(cmdCtx: CmdCtx) {
  const requestConfig: HTTP.RequestConfig = {};
  await handleReqExpert({ ...cmdCtx, requestConfig });
  const httpClient = getCmdHttpClient({ ctx: cmdCtx.ctx, config: cmdCtx.config, source: cmdCtx.source });
  const url = await formatOption({ ...cmdCtx, content: cmdCtx.source.sourceUrl });
  reqLog(cmdCtx, url, requestConfig);

  let res: HTTP.Response;
  try {
    res = await httpClient(cmdCtx.source.requestMethod, url, requestConfig);
  } catch (e) {
    if (httpClient.isError(e)) {
      throw new Error(`${e.response?.statusText} ${JSON.stringify(e.response?.data)}`);
    }
    throw e;
  }

  debugInfo(cmdCtx, () => `cmdNetRes; ${cmdCtx.session.content}\n${JSON.stringify(res, null, 1)}`);
  if (res.status > 300 || res.status < 200) {
    throw new Error(`${res.statusText} ${JSON.stringify(res.data)}`);
  }
  return res;
}
