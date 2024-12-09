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

type Renderer = {
  r: (cmdCtx: CmdCtx, resData: ResData) => Promise<Fragment>;
  verify?: (val: any) => Promise<boolean>;
};

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

  private buildMedia(type: string) {
    return async (cmdCtx: CmdCtx, resData: ResData) => {
      const dataList = Objects.flatten(resData);
      if (Arrays.isEmpty(dataList)) {
        throw "沒有符合條件的結果";
      }
      const elements = [];
      for (const item of dataList) {
        if (
          (cmdCtx.source.expertMode && !cmdCtx.source.expert.renderedMediaUrlToBase64) ||
          !item?.startsWith?.("http")
        ) {
          elements.push(item);
        } else {
          elements.push(
            await this.cmdHttp.urlToBase64(cmdCtx, item, {
              headers: cmdCtx.source.expertMode ? cmdCtx.source.expert.rendererRequestHeaders : undefined,
            }),
          );
        }
      }

      return h.parse(elements.map((text) => h[type](text)).join(""));
    };
  }

  rendererMap: { [key in RendererType]: Renderer } = {
    text: {
      r: async (_, resData: ResData) => {
        if (!Array.isArray(resData)) {
          resData = [JSON.stringify(resData)];
        }
        return h.parse(resData.map((text: any) => `<p>${text}</p>`).join(""));
      },
    },
    image: {
      r: this.buildMedia("img"),
      verify: (v: any) => v.startsWith?.("http") || v.startsWith?.("data:image/"),
    },
    audio: {
      r: this.buildMedia("audio"),
      verify: (v: any) => v.startsWith?.("http") || v.startsWith?.("data:audio/"),
    },
    video: {
      r: this.buildMedia("video"),
      verify: (v: any) => v.startsWith?.("http") || v.startsWith?.("data:video/"),
    },
    file: {
      r: this.buildMedia("file"),
      verify: (v: any) => v.startsWith?.("http") || v.startsWith?.("data:"),
    },
    ejs: {
      r: async (cmdCtx, resData) => {
        const { source, presetPool, smallSession, optionInfoMap } = cmdCtx;
        try {
          if (!source.ejsTemplate) {
            return JSON.stringify(resData);
          }
          const iFns = this.cmdCommon.buildInternalFns(cmdCtx);
          let code = await render(
            source.ejsTemplate,
            {
              $e: smallSession.event,
              $cache: this.ctx.cache,
              $tmpPool: cmdCtx.tmpPool,
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
    },
    cmdLink: {
      r: async (cmdCtx, resData) => {
        if (Strings.isBlank(cmdCtx.source.cmdLink)) {
          return null;
        }
        const cmdLink = await this.cmdCommon.formatOption(cmdCtx, cmdCtx.source.cmdLink, resData);
        await cmdCtx.smallSession.execute(cmdLink);
        return null;
      },
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
    const renderer = this.rendererMap[cmdCtx.source.sendType];
    if (!renderer) {
      throw `不支援的渲染型別: ${cmdCtx.source.sendType}`;
    }

    if (renderer.verify) {
      resData = await Objects.filter(resData, async (value) => renderer.verify(value));
    }

    if (cmdCtx.source.pickOneRandomly) {
      resData = [Random.pick(Objects.flatten(resData))];
    }

    await this.cmdCommon.runHookFns(cmdCtx, "renderedBefore", {
      resData,
    });
    return this.handleMsgPacking(cmdCtx.source, await renderer.r(cmdCtx, resData));
  }
}
