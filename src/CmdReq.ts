import path from "node:path";
import fs from "node:fs";

import {HTTP} from "koishi";
import Strings from "./utils/Strings";
import Objects from "./utils/Objects";
import Files from "./utils/Files";
import {CmdCtx, formatObjOption, formatOption} from "./Core";
import {getCmdHttpClient, loadUrl} from "./Http";

async function handleReqExpert(args: CmdCtx & {
  requestConfig: HTTP.RequestConfig,
}) {
  const {
    ctx, config, source, optionInfoMap,
    requestConfig
  } = args;

  let expert = source.expert;
  if (!source.expertMode || !expert) {
    return;
  }

  requestConfig.headers = {...(expert.requestHeaders || {})};
  await formatObjOption({
    ...args,
    obj: requestConfig.headers,
    compelString: true
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
          compelString: false
        });
      } else {
        requestConfig.data = await formatOption({...args, content: expert.requestRaw});
      }
      break;
    }
    case "x-www-form-urlencoded": {
      if (Objects.isEmpty(expert.requestForm)) {
        break;
      }
      requestConfig.data = new URLSearchParams(await formatObjOption({
        ...args,
        obj: {...expert.requestForm},
        compelString: true
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
        ...args,
        obj: {...(expert.requestForm || {})},
        compelString: true
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

        const fileRes = await loadUrl({
          ...args,
          url: optionInfo.value as string,
          reqConfig: {
            responseType: "blob",
          }
        });

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

export async function cmdReq(cmdCtx: CmdCtx) {
  const requestConfig: HTTP.RequestConfig = {};
  await handleReqExpert({...cmdCtx, requestConfig});
  const httpClient = getCmdHttpClient({ctx: cmdCtx.ctx, config: cmdCtx.config, source: cmdCtx.source});
  return await httpClient(
    cmdCtx.source.requestMethod,
    await formatOption({...cmdCtx, content: cmdCtx.source.sourceUrl}),
    requestConfig
  );
}


