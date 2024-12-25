import path from "node:path";
import fs from "node:fs";

import { Context, HTTP } from "koishi";
import Strings from "./utils/Strings";
import Objects from "./utils/Objects";
import Files from "./utils/Files";
import { CmdCtx } from "./CoreCmd";
import CmdCommon, { BizError } from "./CmdCommon";
import CmdHttp from "./CmdHttp";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";
import { Config } from "./Config";

export default class CmdReq implements BeanTypeInterface {
  private ctx: Context;
  private config: Config;
  private cmdCommon: CmdCommon;
  private cmdHttp: CmdHttp;

  constructor(beanHelper: BeanHelper) {
    this.ctx = beanHelper.getByName("ctx");
    this.config = beanHelper.getByName("config");
    this.cmdCommon = beanHelper.instance(CmdCommon);
    this.cmdHttp = beanHelper.instance(CmdHttp);
  }

  private reqDataToJson(data: any) {
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

  debugInfo(content: string | (() => string)) {
    if (!this.config.expertMode || !this.config.expert.showDebugInfo) {
      return;
    }
    this.ctx.logger.info(typeof content === "string" ? content : content());
  }

  private reqLog(cmdCtx: CmdCtx, url: string, requestConfig: HTTP.RequestConfig) {
    this.debugInfo(() => {
      const rc = { ...requestConfig };
      rc.data = this.reqDataToJson(rc.data);
      return (
        `cmdNetReq; ${cmdCtx.smallSession.content}\n` +
        `url: ${url}\n` +
        `method: ${cmdCtx.source.requestMethod}\n` +
        `config: ${JSON.stringify(rc, null, 2)}`
      );
    });
  }

  private async handleReqExpert(cmdCtx: CmdCtx, requestConfig: HTTP.RequestConfig) {
    const expert = cmdCtx.source.expert;
    if (!cmdCtx.source.expertMode || !expert) {
      return;
    }

    requestConfig.headers = { ...(expert.requestHeaders || {}) };
    await this.cmdCommon.formatObjOption(cmdCtx, requestConfig.headers, true);

    if (!expert.resModified.ignoreUserCall || !cmdCtx.isUserCall) {
      if (expert.resModified.type === "LastModified") {
        const val = await this.cmdCommon.cacheGet("LastModified_" + cmdCtx.source.command);
        if (val) {
          requestConfig.headers["If-modified-Since"] = val;
        }
      } else if (expert.resModified.type === "ETag") {
        const val = await this.cmdCommon.cacheGet("ETag_" + cmdCtx.source.command);
        if (val) {
          requestConfig.headers["If-None-Match"] = val;
        }
      }
    }

    switch (expert.requestDataType) {
      case "raw": {
        if (Strings.isBlank(expert.requestRaw)) {
          break;
        }
        if (expert.requestJson) {
          requestConfig.data = JSON.parse(expert.requestRaw);
          await this.cmdCommon.formatObjOption(cmdCtx, requestConfig.data, false);
        } else {
          requestConfig.data = await this.cmdCommon.formatOption(cmdCtx, expert.requestRaw);
        }
        break;
      }
      case "x-www-form-urlencoded": {
        if (Objects.isEmpty(expert.requestForm)) {
          break;
        }
        requestConfig.data = new URLSearchParams(
          await this.cmdCommon.formatObjOption(cmdCtx, { ...expert.requestForm }, true),
        );
        break;
      }
      case "form-data": {
        if (Objects.isEmpty(expert.requestForm) && Objects.isEmpty(expert.requestFormFiles)) {
          break;
        }
        const form = new FormData();
        requestConfig.data = form;
        const data = await this.cmdCommon.formatObjOption(cmdCtx, { ...(expert.requestForm || {}) }, true);
        for (const key in data) {
          form.append(key, data[key]);
        }

        const fileOverwriteKeys = [];
        for (const key in cmdCtx.optionInfoMap.infoMap) {
          const optionInfo = cmdCtx.optionInfoMap.infoMap[key];
          const oKey = optionInfo.overwriteKey || key;
          if (
            !optionInfo.autoOverwrite ||
            !optionInfo.isFileUrl ||
            Strings.isBlank(optionInfo.value + "") ||
            typeof expert.requestFormFiles[oKey] === "undefined"
          ) {
            continue;
          }

          const fileRes = await this.cmdHttp.loadUrl(cmdCtx, optionInfo.value as string, { responseType: "blob" });

          form.append(oKey, fileRes.data, optionInfo.fileName || (await Files.getFileNameByBlob(fileRes.data)));
          fileOverwriteKeys.push(oKey);
        }

        for (const key in expert.requestFormFiles) {
          if (fileOverwriteKeys.includes(key)) {
            continue;
          }
          const item = expert.requestFormFiles[key];
          const filePath = path.join(this.ctx.baseDir, item);
          const fileBlob = new Blob([fs.readFileSync(filePath)]);
          form.append(key, fileBlob, path.parse(filePath).base);
        }
        break;
      }
    }
  }

  async cmdReq(cmdCtx: CmdCtx) {
    if (Strings.isBlank(cmdCtx.source.sourceUrl)) {
      return null;
    }
    const requestConfig: HTTP.RequestConfig = {};
    await this.cmdCommon.runHookFns(cmdCtx, "reqDataBefore");
    const url = await this.cmdCommon.formatOption(cmdCtx, cmdCtx.source.sourceUrl);
    await this.handleReqExpert(cmdCtx, requestConfig);

    await this.cmdCommon.runHookFns(cmdCtx, "reqBefore", {
      url,
      requestConfig,
    });
    this.reqLog(cmdCtx, url, requestConfig);
    const httpClient = this.cmdHttp.getCmdHttpClient(cmdCtx.source);
    const res: HTTP.Response = await httpClient(cmdCtx.source.requestMethod, url, requestConfig);

    if (
      res.status === 304 &&
      cmdCtx.source.expertMode &&
      (!cmdCtx.source.expert?.resModified?.ignoreUserCall || !cmdCtx.isUserCall) &&
      ["LastModified", "ETag"].includes(cmdCtx.source.expert?.resModified?.type)
    ) {
      throw new BizError(cmdCtx.source.expert.resModified.type + " unmodified", "resModified");
    }

    this.debugInfo(() => `cmdNetRes; ${cmdCtx.smallSession.content}\n${JSON.stringify(res, null, 1)}`);
    return res;
  }
}
