import { parse } from "node-html-parser";
import { Context, HTTP } from "koishi";
import { BaseProcessorType, Config } from "./Config";
import Objects from "./utils/Objects";
import { CmdCtx } from "./CoreCmd";
import Strings from "./utils/Strings";
import CmdCommon from "./CmdCommon";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";

export type ResData = { [k in any]: any } | [];

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
      return data;
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
        data = Buffer.from(data).toString();
      }
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    function: async (res, cmdCtx) => {
      if (!cmdCtx.source.dataFunction) {
        return;
      }
      const data = await this.cmdCommon.generateCodeRunner(cmdCtx, {
        response: res,
      })(cmdCtx.source.dataFunction);
      return data instanceof Object ? data : [data];
    },
  };

  async cmdResData(cmdCtx: CmdCtx, res: HTTP.Response): Promise<ResData> {
    const parser = this.baseProcessorMap[cmdCtx.source.dataType];
    if (!parser) {
      throw new Error(`未知的響應資料處理器: ${cmdCtx.source.dataType}`);
    }
    const resData = parser(res, cmdCtx);
    if (resData === undefined || resData === null) {
      throw "沒有獲取到資料";
    }
    return resData;
  }
}
