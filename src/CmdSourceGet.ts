import path from "node:path";
import fs from "node:fs";

import { Context, h, HTTP } from "koishi";
import { SendOptions } from "@satorijs/protocol";

import Strings from "./utils/Strings";
import Objects from "./utils/Objects";
import Files from "./utils/Files";
import { CmdCtx } from "./CoreCmd";
import CmdCommon, { BizError } from "./CmdCommon";
import CmdHttp from "./CmdHttp";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";
import { CmdSourceType, Config } from "./Config";

export type SourceResFactory = {
  [Type in CmdSourceType]: {
    type: Type;
  } & {
    none: unknown;
    url: {
      response: HTTP.Response;
    };
    cmd: {
      elements: h[];
    };
  }[Type];
};
export type SourceRes = SourceResFactory[CmdSourceType];

export default class CmdSourceGet implements BeanTypeInterface {
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

  start(): void | Promise<void> {
    this.initCmdReqHook();
  }

  private urlReqDataToJson(data: any) {
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

  private urlReqLog(cmdCtx: CmdCtx, url: string, requestConfig: HTTP.RequestConfig) {
    const rc = { ...requestConfig };
    rc.data = this.urlReqDataToJson(rc.data);
    this.cmdCommon.debugInfo(
      `cmdNetReq; ${cmdCtx.smallSession.content}\n` +
        `url: ${url}\n` +
        `method: ${cmdCtx.source.requestMethod}\n` +
        `config: ${JSON.stringify(rc, null, 2)}`,
    );
  }

  private async handleUrlReqExpert(cmdCtx: CmdCtx, requestConfig: HTTP.RequestConfig) {
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

  private async urlReq(cmdCtx: CmdCtx): Promise<HTTP.Response> {
    const requestConfig: HTTP.RequestConfig = {};
    const url = await this.cmdCommon.formatOption(cmdCtx, cmdCtx.source.sourceUrl);
    await this.handleUrlReqExpert(cmdCtx, requestConfig);

    await this.cmdCommon.runHookFns(cmdCtx, "urlReqBefore", {
      url,
      requestConfig,
    });
    this.urlReqLog(cmdCtx, url, requestConfig);
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

    this.cmdCommon.debugInfo(`cmdNetRes; ${cmdCtx.smallSession.content}\n${JSON.stringify(res, null, 1)}`);
    return res;
  }

  private cmdReqExecutePool: Record<string, { elements: h[]; lastCmd?: string }> = {};

  private initCmdReqHook() {
    this.ctx.on(
      "before-send",
      async (session, options: SendOptions) => {
        const cmd = this.cmdCommon.getCmdByElements(options.session.app.config.prefix, options.session.elements);
        if (Strings.isBlank(cmd)) {
          return;
        }
        const cmdObj = this.cmdReqExecutePool[options.session.id + "-" + cmd];
        if (!cmdObj) {
          return;
        }
        const currentCmd = this.cmdCommon.getCmdByElements(session.app.config.prefix, session.elements);
        if (cmdObj.lastCmd && cmdObj.lastCmd !== currentCmd) {
          cmdObj.elements.push(h("br"));
        }
        cmdObj.lastCmd = currentCmd;
        cmdObj.elements.push(...session.elements);
        return true;
      },
      true,
    );
  }

  private async cmdReq(cmdCtx: CmdCtx): Promise<h[]> {
    let cmdList: string[] = [await this.cmdCommon.formatOption(cmdCtx, cmdCtx.source.sourceCmd)];
    if (cmdCtx.source.sourceMultipleCmd) {
      cmdList = cmdList[0].split(/[\r\n]/g);
    }
    const elements = [];
    const key = cmdCtx.smallSession.session.id + "-" + cmdCtx.source.command;
    this.cmdReqExecutePool[key] = {
      elements,
    };
    for (const cmd of cmdList) {
      await cmdCtx.smallSession.execute(cmd);
    }
    delete this.cmdReqExecutePool[key];
    return elements;
  }

  async get(cmdCtx: CmdCtx): Promise<SourceRes> {
    await this.cmdCommon.runHookFns(cmdCtx, "SourceGetBefore");
    const sourceType = cmdCtx.source.sourceType;
    if (sourceType === "none") {
      return {
        type: sourceType,
      };
    }
    if (sourceType === "url") {
      return {
        type: sourceType,
        response: await this.urlReq(cmdCtx),
      };
    }
    if (sourceType === "cmd") {
      return {
        type: sourceType,
        elements: await this.cmdReq(cmdCtx),
      };
    }
  }
}
