import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { Context, h, HTTP } from "koishi";
import { BaseProcessorType, CmdSourceType, Config } from "./Config";
import Objects from "./utils/Objects";
import { CmdCtx } from "./CoreCmd";
import Strings from "./utils/Strings";
import CmdCommon, { BizError } from "./CmdCommon";
import type { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";
import type { SourceRes, SourceResFactory } from "./CmdSourceGet";

type BaseType = string | number | boolean;
type BaseObj = Record<any, BaseType>;
type BaseList = BaseType[];
type DataType = BaseType | BaseObj | BaseList;
export type ResData = Record<any, DataType> | DataType[] | h[];

type BaseProcessorMap = {
  [key in BaseProcessorType]: {
    sourceType: CmdSourceType[];
    p: (sourceRes: SourceRes, cmdCtx: CmdCtx) => Promise<ResData> | ResData;
  };
};
interface ExpandData {
  response?: HTTP.Response;
  elements?: h[];
}

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
    jsonObject: {
      sourceType: ["none"],
      p: async (_, cmdCtx) => {
        let data: any;
        const jsonObject = await this.cmdCommon.formatOption(cmdCtx, cmdCtx.source.jsonObject);
        try {
          data = JSON.parse(jsonObject);
        } catch (_e) {}
        return data instanceof Object ? data : [jsonObject];
      },
    },
    json: {
      sourceType: ["url"],
      p: (sourceRes, { source }) => {
        let data = (sourceRes as SourceResFactory["url"]).response.data;
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
    },
    plain: {
      sourceType: ["url"],
      p: (sourceRes) => {
        let data = (sourceRes as SourceResFactory["url"]).response.data;
        if (data instanceof ArrayBuffer) {
          data = JSON.parse(Buffer.from(data).toString());
        } else if (typeof data === "string") {
          data = JSON.parse(data);
        }
        return data;
      },
    },
    txt: {
      sourceType: ["url"],
      p: (sourceRes) => {
        const data = (sourceRes as SourceResFactory["url"]).response.data ?? "";
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
    },
    html: {
      sourceType: ["url"],
      p: (sourceRes, { source }) => {
        let data = (sourceRes as SourceResFactory["url"]).response.data;
        if (data instanceof ArrayBuffer) {
          data = Buffer.from(data).toString();
        }
        const root = parse(data);
        return Array.from(root.querySelectorAll(source.jquerySelector ?? "p"), (e) =>
          source.attribute ? e.getAttribute(source.attribute) : e.structuredText,
        ).filter((s) => Strings.isNotBlank(s));
      },
    },
    resource: {
      sourceType: ["url"],
      p: (sourceRes) => {
        const res = (sourceRes as SourceResFactory["url"]).response;
        return [`data:${res.headers.get("Content-Type")};base64,` + Buffer.from(res.data).toString("base64")];
      },
    },
    koishiElements: {
      sourceType: ["cmd"],
      p: (sourceRes) => {
        return (sourceRes as SourceResFactory["cmd"]).elements;
      },
    },
    function: {
      sourceType: ["none", "url", "cmd"],
      p: async (sourceRes, cmdCtx) => {
        if (Strings.isBlank(cmdCtx.source.dataFunction)) {
          return;
        }
        const data = await this.cmdCommon.generateCodeRunner(
          cmdCtx,
          true,
          this.buildExpandData(sourceRes),
        )(cmdCtx.source.dataFunction);
        return data instanceof Object ? data : [data];
      },
    },
  };

  private buildExpandData(sourceRes: SourceRes) {
    const expandData: ExpandData = {};
    if (sourceRes.type === "url") {
      expandData.response = sourceRes.response;
    } else if (sourceRes.type === "cmd") {
      expandData.elements = sourceRes.elements;
    }
    return expandData;
  }

  async handleResModified(cmdCtx: CmdCtx, sourceRes: SourceRes, resData: ResData) {
    const type = cmdCtx.source.expert?.resModified.type;
    if (
      !cmdCtx.source.expertMode ||
      !cmdCtx.source.expert ||
      type === "none" ||
      (cmdCtx.source.expert.resModified.ignoreUserCall && cmdCtx.isUserCall)
    ) {
      return;
    }
    if (sourceRes.type === "url") {
      if (type === "LastModified") {
        const val = sourceRes.response.headers.get("Last-Modified");
        if (val) {
          await this.cmdCommon.cacheSet("LastModified_" + cmdCtx.source.command, val);
        }
      } else if (type === "ETag") {
        const val = sourceRes.response.headers.get("ETag");
        if (val) {
          await this.cmdCommon.cacheSet("ETag_" + cmdCtx.source.command, val);
        }
      }
    }
    if (type === "resDataHash") {
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

  async cmdResData(cmdCtx: CmdCtx, sourceRes: SourceRes): Promise<ResData> {
    const processor = this.baseProcessorMap[cmdCtx.source.dataType];
    if (!processor) {
      throw new Error(`未知的響應資料處理器: ${cmdCtx.source.dataType}`);
    }
    await this.cmdCommon.runHookFns(cmdCtx, "resDataBefore", this.buildExpandData(sourceRes));
    if (!processor.sourceType.includes(cmdCtx.source.sourceType)) {
      throw cmdCtx.source.dataType + " 處理器無法處理來源型別 " + cmdCtx.source.sourceType;
    }
    const resData = await processor.p(sourceRes, cmdCtx);
    if (resData === undefined || resData === null) {
      throw "沒有獲取到資料";
    }
    await this.handleResModified(cmdCtx, sourceRes, resData);
    return resData;
  }
}
