import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import { Context, h, HTTP } from "koishi";

import { CmdCtx } from "./CoreCmd";
import CmdHttp from "./CmdHttp";
import Objects from "./utils/Objects";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";
import { Config, HookFn, HookFnsType } from "./Config";
import Strings from "./utils/Strings";

import { Tables } from "@koishijs/cache";
import Arrays from "./utils/Arrays";

declare module "@koishijs/cache" {
  interface Tables {
    "network-data-getter": any;
  }
}

const AsyncFunction: FunctionConstructor = (async () => 0).constructor as FunctionConstructor;

export type BizErrorType = "hookBlock" | "hookBlock-msg" | "resModified";

export class BizError extends Error {
  type: BizErrorType;

  constructor(message?: string, type?: BizErrorType) {
    super(message);
    this.type = type;
  }
}

export default class CmdCommon implements BeanTypeInterface {
  private ctx: Context;
  private config: Config;
  private cmdHttp: CmdHttp;
  private cache: Record<string, any> = {};
  private codeRunnerModules: Record<string, any> = null;

  constructor(beanHelper: BeanHelper) {
    this.ctx = beanHelper.getByName("ctx");
    this.config = beanHelper.getByName("config");
    this.cmdHttp = beanHelper.instance(CmdHttp);
  }

  internalFns: { [key in string]: (...args: any[]) => any } = {
    async urlToString(
      cmdCtx: CmdCtx,
      args: {
        url: string;
        reqConfig?: HTTP.RequestConfig;
      },
    ) {
      const res = await this.cmdHttp.loadUrl(cmdCtx, args.url, args.reqConfig);
      if (typeof res.data === "string") {
        return res.data;
      }
      return Buffer.from(res.data).toString("latin1");
    },
    async urlToBase64(
      cmdCtx: CmdCtx,
      args: {
        url: string;
        reqConfig?: HTTP.RequestConfig;
      },
    ) {
      return this.cmdHttp.urlToBase64(cmdCtx, args.url, args.reqConfig);
    },
  };

  buildCodeRunnerValues(cmdCtx: CmdCtx, expandData?: Record<string, any>) {
    const values = {
      ...(cmdCtx.presetPool.presetConstantPool ?? {}),
      ...(cmdCtx.optionInfoMap.map ?? {}),
      $e: cmdCtx.smallSession.event,
      $tmpPool: cmdCtx.tmpPool,
    };
    if (expandData) {
      for (const key in expandData) {
        values["$" + key] = expandData[key];
      }
    }
    return values;
  }

  buildCodeRunnerModules() {
    if (!this.codeRunnerModules) {
      this.codeRunnerModules = {
        crypto,
        OTPAuth,
        http: BeanHelper.buildLazyProxy(() => this.ctx.http),
        cache: BeanHelper.buildLazyProxy(() => this.ctx.cache),
        logger: this.ctx.logger,
      };
    }
    return this.codeRunnerModules;
  }

  buildCodeRunnerArgs(cmdCtx: CmdCtx, expandData?: Record<string, any>) {
    const args = {
      ...(cmdCtx.presetPool.presetFnPool ?? {}),
      ...this.buildCodeRunnerValues(cmdCtx, expandData),
    };
    const modules = this.buildCodeRunnerModules();
    for (const key in modules) {
      args["$" + key] = modules[key];
    }

    for (const name in this.internalFns) {
      args["$" + name] = this.internalFns[name].bind(this, cmdCtx);
    }

    return args;
  }

  generateCodeRunner(cmdCtx: CmdCtx, completeReturn: boolean, expandData?: Record<string, any>) {
    const args = this.buildCodeRunnerArgs(cmdCtx, expandData);
    return async (code: string) => {
      if (completeReturn) {
        const rows = code.split(/\r\n|[\r\n]/);
        for (let i = rows.length - 1; i >= 0; i--) {
          if (Strings.isNotBlank(rows[i])) {
            break;
          }
          rows.pop();
        }
        if (rows.length === 1 && !rows[0].trim().startsWith("return")) {
          code = "return " + rows[0];
        }
      }
      const fn = AsyncFunction("args", "with (args) {\n" + code + "\n}");
      return fn.apply(fn, [args]);
    };
  }

  async formatOption(cmdCtx: CmdCtx, content: string, data?: any): Promise<string> {
    const contentList = [];
    content = content.replace(/<%=([\s\S]+?)%>/g, function (match: string, p1: string) {
      contentList.push(p1);
      return match;
    });
    if (contentList.length < 1) {
      return content;
    }

    const codeRunner = this.generateCodeRunner(cmdCtx, false, { data: data });

    const resMap = {};
    for (let i = 0; i < contentList.length; i++) {
      const item = contentList[i];
      try {
        resMap[i + "_" + item] = await codeRunner("return " + item.replace(/\n/g, "\\n"));
      } catch (e) {
        this.ctx.logger.error(item);
        this.ctx.logger.error(e);
      }
    }

    let i = 0;
    content = content.replace(/<%=([\s\S]+?)%>/g, function (match: string, p1: string) {
      return resMap[i++ + "_" + p1] ?? "";
    });

    return content;
  }

  async formatObjOption(cmdCtx: CmdCtx, obj: any, compelString: boolean) {
    const { optionInfoMap } = cmdCtx;
    await Objects.thoroughForEach(obj, async (value, key, obj) => {
      if (typeof value === "string") {
        obj[key] = await this.formatOption(cmdCtx, obj[key]);
      }
    });

    if (optionInfoMap)
      for (const name in optionInfoMap.infoMap) {
        const optionInfo = optionInfoMap.infoMap[name];
        const oKey = optionInfo.overwriteKey || name;
        const gKey = oKey.replace(/(?<!\?)\./g, "?.").replace(/(?<!\?.)\[/g, "?.[");
        if (
          !optionInfo.autoOverwrite ||
          typeof optionInfo.value === "undefined" ||
          typeof Function("obj", `return obj?.${gKey}`)(obj) === "undefined"
        ) {
          continue;
        }
        try {
          Function("obj,optionInfo", `obj.${oKey} = optionInfo.value` + (compelString ? '+""' : ""))(obj, optionInfo);
        } catch (_e) {}
      }

    return obj;
  }

  async runHookFns(cmdCtx: CmdCtx, type: HookFnsType, expandData?: Record<string, any>) {
    if (!cmdCtx.source.expertMode) {
      return;
    }
    const hookFns: HookFn[] = cmdCtx.source.expert?.hookFns?.filter(
      (hookFn) => hookFn.type === type && Strings.isNotBlank(hookFn.fn),
    );
    const codeRunner = this.generateCodeRunner(cmdCtx, false, expandData);
    for (const hookFn of hookFns) {
      const res = await codeRunner(hookFn.fn);
      if (res === false) {
        throw new BizError(`hook ${type} block`, "hookBlock");
      }
      if (typeof res === "string") {
        throw new BizError(res, "hookBlock-msg");
      }
    }
    return;
  }

  debugInfo(...args: any[]) {
    if (this.config.expertMode && this.config.expert.showDebugInfo) {
      this.ctx.logger.info(args.shift(), ...args);
    } else {
      this.ctx.logger.debug(args.shift(), ...args);
    }
  }

  async cacheGet(key: string): Promise<Tables["network-data-getter"]> {
    if (this.ctx.cache) {
      return this.ctx.cache.get("network-data-getter", key);
    }
    return this.cache[key];
  }

  async cacheSet(key: string, value: Tables["network-data-getter"]) {
    if (this.ctx.cache) {
      await this.ctx.cache.set("network-data-getter", key, value);
    }
    this.cache[key] = value;
  }

  cutElementsToFirstText(elements: h[]) {
    elements = [...elements];
    const firstTextIndex = elements.findIndex((ele) => ele.type === "text");
    if (firstTextIndex > 0) {
      elements.splice(0, firstTextIndex);
    }
    return elements;
  }

  getCmdByElements(prefix: string[], elements: h[]): string {
    if (Arrays.isEmpty(elements)) {
      return "";
    }
    elements = this.cutElementsToFirstText(elements);
    let cmd: string = elements[0].attrs["content"]?.trim() + "";
    prefix?.forEach((p: string) => {
      cmd = cmd.replace(new RegExp("^" + p), "").trim();
    });
    return cmd.split(/\s/)[0];
  }
}
