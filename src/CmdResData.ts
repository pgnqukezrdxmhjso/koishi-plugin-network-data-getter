import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { Context, HTTP } from "koishi";
import { BaseProcessorType, Config } from "./Config";
import Objects from "./utils/Objects";
import { CmdCtx } from "./CoreCmd";
import Strings from "./utils/Strings";
import CmdCommon, { BizError } from "./CmdCommon";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";

export type ResData = Record<any, any> | any[];

type BaseProcessorMap = {
  [key in BaseProcessorType]: (res: HTTP.Response, cmdCtx: CmdCtx) => ResData;
};

export default class CmdResData implements BeanTypeInterface {
  private ctx: Context;
  private config: Config;
  private cmdCommon: CmdCommon;

  constructor(beanHelper: BeanHelper) {
    this.ctx = beanHelper.getByName("ctx");
    this.config = beanHelper.getByName("config");
    this.cmdCommon = beanHelper.instance(CmdCommon);
  }

  baseProcessorMap: BaseProcessorMap = {
    json: (res, { source }) => {
      let data = res.data;
      if (data instanceof ArrayBuffer) {
        data = JSON.parse(Buffer.from(data).toString());
      } else if (typeof data === "string") {
        data = JSON.parse(data);
      }
      if (source.jsonKey) {
        data = Objects.getValue(data, source.jsonKey.replace(/[;{}]/g, ""));
      }
      return data instanceof Object ? data : [data];
    },
    txt: (res) => {
      const data = res.data ?? "";
      let text: string = data;
      if (data instanceof ArrayBuffer) {
        text = Buffer.from(data).toString();
      } else if (typeof data !== "string") {
        try {
          text = JSON.stringify(data);
        } catch (_e) {
          text = data.toString();
        }
      }
      return text.split(/[\r\n]+/).filter((s) => Strings.isNotBlank(s));
    },
    html: (res, { source }) => {
      let data = res.data;
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data).toString();
      }
      const root = parse(data);
      return Array.from(root.querySelectorAll(source.jquerySelector ?? "p"), (e) =>
        source.attribute ? e.getAttribute(source.attribute) : e.structuredText,
      ).filter((s) => Strings.isNotBlank(s));
    },
    resource: (res) => {
      return [`data:${res.headers.get("Content-Type")};base64,` + Buffer.from(res.data).toString("base64")];
    },
    plain: (res) => {
      let data = res.data;
      if (data instanceof ArrayBuffer) {
        data = JSON.parse(Buffer.from(data).toString());
      } else if (typeof data === "string") {
        data = JSON.parse(data);
      }
      return data;
    },
    function: async (res, cmdCtx) => {
      if (Strings.isBlank(cmdCtx.source.dataFunction)) {
        return;
      }
      const data = await this.cmdCommon.generateCodeRunner(cmdCtx, {
        response: res,
      })(cmdCtx.source.dataFunction);
      return data instanceof Object ? data : [data];
    },
  };

  async resModified(cmdCtx: CmdCtx, res: HTTP.Response, resData: ResData) {
    if (!cmdCtx.source.expertMode || !cmdCtx.source.expert) {
      return;
    }
    const type = cmdCtx.source.expert.resModified.type;
    if (type === "LastModified") {
      const val = res.headers.get("Last-Modified");
      if (val) {
        await this.cmdCommon.cacheSet("LastModified_" + cmdCtx.source.command, val);
      }
    } else if (type === "ETag") {
      const val = res.headers.get("ETag");
      if (val) {
        await this.cmdCommon.cacheSet("ETag_" + cmdCtx.source.command, val);
      }
    } else if (type === "resDataHash") {
      const cacheHash = await this.cmdCommon.cacheGet("resDataHash_" + cmdCtx.source.command);
      const hash = createHash("md5");
      hash.update(JSON.stringify(resData));
      const val = hash.digest("hex");
      if (cacheHash && cacheHash === val) {
        throw new BizError("resDataHash unmodified", "resModified");
      }
      await this.cmdCommon.cacheSet("resDataHash_" + cmdCtx.source.command, val);
    }
  }

  async cmdResData(cmdCtx: CmdCtx, res: HTTP.Response): Promise<ResData> {
    const processor = this.baseProcessorMap[cmdCtx.source.dataType];
    if (!processor) {
      throw new Error(`未知的響應資料處理器: ${cmdCtx.source.dataType}`);
    }
    await this.cmdCommon.runHookFns(cmdCtx, "resDataBefore", {
      response: res,
    });
    const resData = processor(res, cmdCtx);
    if (resData === undefined || resData === null) {
      throw "沒有獲取到資料";
    }
    await this.resModified(cmdCtx, res, resData);
    return resData;
  }
}
