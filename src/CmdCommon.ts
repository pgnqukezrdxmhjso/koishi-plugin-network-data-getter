import { CmdCtx } from "./CoreCmd";
import { Context, HTTP } from "koishi";
import CmdHttp from "./CmdHttp";
import Objects from "./utils/Objects";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";
import { Config } from "./Config";

const AsyncFunction: FunctionConstructor = (async () => 0).constructor as FunctionConstructor;

export default class CmdCommon implements BeanTypeInterface {
  private ctx: Context;
  private config: Config;
  private cmdHttp: CmdHttp;

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

  buildInternalFns(cmdCtx: CmdCtx) {
    const fns = {};
    for (const name in this.internalFns) {
      fns["$" + name] = this.internalFns[name].bind(this, cmdCtx);
    }
    return {
      fns,
      arg: `{${Object.keys(fns).join(",")}}`,
    };
  }

  generateCodeRunner(cmdCtx: CmdCtx, expandData?: { [k in string]: any }) {
    const { presetPool, smallSession, optionInfoMap } = cmdCtx;
    const iFns = this.buildInternalFns(cmdCtx);
    const fnArgTexts = ["$e", iFns.arg, presetPool.presetConstantPoolFnArg, presetPool.presetFnPoolFnArg];
    const fnArgs: any[] = [
      smallSession.event,
      iFns.fns,
      presetPool.presetConstantPool ?? {},
      presetPool.presetFnPool ?? {},
    ];
    if (optionInfoMap) {
      fnArgTexts.push(optionInfoMap.fnArg);
      fnArgs.push(optionInfoMap.map ?? {});
    }

    if (expandData) {
      for (const key in expandData) {
        fnArgTexts.push("$" + key);
        fnArgs.push(expandData[key]);
      }
    }

    return async (code: string) => {
      const fn = AsyncFunction(...fnArgTexts, code);
      return fn.apply(fn, fnArgs);
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

    const codeRunner = this.generateCodeRunner(cmdCtx, { data: data });

    const resMap = {};
    for (let i = 0; i < contentList.length; i++) {
      const item = contentList[i];
      try {
        resMap[i + "_" + item] = await codeRunner("return " + item.replace(/\n/g, "\\n"));
      } catch (e) {
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
}
