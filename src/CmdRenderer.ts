import { Context, Fragment, h, Random } from "koishi";
import { render } from "ejs";

import { CmdCtx } from "./CoreCmd";
import { CmdSource, Config, RendererType } from "./Config";
import Strings from "./utils/Strings";
import { ResData } from "./CmdResData";
import CmdCommon from "./CmdCommon";
import CmdHttp from "./CmdHttp";
import Objects from "./utils/Objects";
import Arrays from "./utils/Arrays";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";

type Renderer = (cmdCtx: CmdCtx, resData: ResData) => Promise<Fragment>;

export default class CmdRenderer implements BeanTypeInterface {
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

  private buildMedia(type: string, base64Prefix: string) {
    return async (cmdCtx: CmdCtx, resData: ResData) => {
      const { source } = cmdCtx;
      let dataList = Objects.flatten(resData).filter((s) => s.startsWith("http") || s.startsWith(base64Prefix));
      if (Arrays.isEmpty(dataList)) {
        throw "沒有符合條件的結果";
      }
      if (source.pickOneRandomly) {
        dataList = [Random.pick(dataList)];
      }
      const elements = [];
      for (const item of dataList) {
        if ((source.expertMode && !source.expert.renderedMediaUrlToBase64) || !item?.startsWith?.("http")) {
          elements.push(item);
        } else {
          elements.push(
            await this.cmdHttp.urlToBase64(cmdCtx, item, {
              headers: source.expertMode ? source.expert.rendererRequestHeaders : undefined,
            }),
          );
        }
      }

      return h.parse(elements.map((text) => h[type](text)).join(""));
    };
  }

  rendererMap: { [key in RendererType]: Renderer } = {
    text: async ({ source }, resData) => {
      let dataList = Objects.flatten(resData);
      if (source.pickOneRandomly) {
        dataList = [Random.pick(dataList)];
      }
      return h.parse(dataList.map((text: any) => `<p>${text}</p>`).join(""));
    },
    image: this.buildMedia("img", "data:image/"),
    audio: this.buildMedia("audio", "data:audio/"),
    video: this.buildMedia("video", "data:video/"),
    file: this.buildMedia("file", "data:"),
    ejs: async (cmdCtx, resData) => {
      const { source, presetPool, smallSession, optionInfoMap } = cmdCtx;
      try {
        if (source.pickOneRandomly) {
          resData = [Random.pick(Objects.flatten(resData))];
        }
        if (!source.ejsTemplate) {
          return JSON.stringify(resData);
        }
        const iFns = this.cmdCommon.buildInternalFns(cmdCtx);
        let code = await render(
          source.ejsTemplate,
          {
            $e: smallSession.event,
            data: resData,
            ...iFns.fns,
            ...(presetPool.presetConstantPool ?? {}),
            ...(presetPool.presetFnPool ?? {}),
            ...(optionInfoMap.map ?? {}),
            $data: resData,
          },
          {
            async: true,
            rmWhitespace: true,
          },
        );
        code = code.replace(/\n\n/g, "\n");
        return h.parse(code);
      } catch (err) {
        this.ctx.logger.error("Error while parsing ejs data and json:");
        this.ctx.logger.error(err);
        throw err;
      }
    },
    cmdLink: async (cmdCtx, resData) => {
      if (Strings.isBlank(cmdCtx.source.cmdLink)) {
        return null;
      }
      if (cmdCtx.source.pickOneRandomly) {
        resData = [Random.pick(Objects.flatten(resData))];
      }
      const cmdLink = await this.cmdCommon.formatOption(cmdCtx, cmdCtx.source.cmdLink, resData);
      await cmdCtx.smallSession.execute(cmdLink);
      return null;
    },
  };

  handleMsgPacking(source: CmdSource, fragment: Fragment): Fragment {
    if (!fragment) {
      return fragment;
    }
    const msgPackingType =
      source.messagePackingType !== "inherit" ? source.messagePackingType : this.config.messagePackingType;

    if (!msgPackingType || msgPackingType === "none") {
      return fragment;
    }
    if (!(fragment instanceof Array)) {
      fragment = [fragment];
    }
    if (msgPackingType === "multiple" && fragment.length < 2) {
      return fragment;
    }

    const forward = h.parse("<message forward></message>");
    forward[0].children.push(
      ...fragment.map((f) => {
        const message = h.parse(`<message></message>`)[0];

        if (typeof f === "string") {
          message.children.push(...h.parse(f));
        } else if (f instanceof Array) {
          message.children.push(...f);
        } else {
          message.children.push(f);
        }
        return message;
      }),
    );
    return forward;
  }

  async rendered(cmdCtx: CmdCtx, resData: ResData) {
    const { source } = cmdCtx;
    const renderer = this.rendererMap[source.sendType];
    if (!renderer) {
      throw `不支援的渲染型別: ${source.sendType}`;
    }
    return this.handleMsgPacking(cmdCtx.source, await renderer(cmdCtx, resData));
  }
}
