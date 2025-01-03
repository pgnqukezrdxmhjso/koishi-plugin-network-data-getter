import { render } from "ejs";
import path from "node:path";
import fs from "node:fs";
import type { ReactElement } from "react";
import { Context, h, Random } from "koishi";
import type { ImageOptions } from "koishi-plugin-vercel-satori-png-service";

import { CmdCtx } from "./CoreCmd";
import type { CmdSource, Config, ConfigVercelSatoriFont, RendererType } from "./Config";
import Strings from "./utils/Strings";
import { ResData } from "./CmdResData";
import CmdCommon from "./CmdCommon";
import CmdHttp from "./CmdHttp";
import Objects from "./utils/Objects";
import Arrays from "./utils/Arrays";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";

type Renderer = {
  r: (cmdCtx: CmdCtx, resData: ResData) => Promise<h[]>;
  verify?: (val: any) => Promise<boolean>;
};

export default class CmdRenderer implements BeanTypeInterface {
  private ctx: Context;
  private config: Config;
  private cmdCommon: CmdCommon;
  private cmdHttp: CmdHttp;
  private vercelSatoriFonts: ConfigVercelSatoriFont[];

  constructor(beanHelper: BeanHelper) {
    this.ctx = beanHelper.getByName("ctx");
    this.config = beanHelper.getByName("config");
    this.cmdCommon = beanHelper.instance(CmdCommon);
    this.cmdHttp = beanHelper.instance(CmdHttp);
  }

  start() {
    this.initVercelSatoriFonts();
  }

  initVercelSatoriFonts() {
    if (!this.config.expertMode || Arrays.isEmpty(this.config.expert.vercelSatoriFonts)) {
      return;
    }
    const vercelSatoriFonts: ConfigVercelSatoriFont[] = [];
    for (const vercelSatoriFont of this.config.expert.vercelSatoriFonts) {
      const font = {
        ...vercelSatoriFont,
        data: fs.readFileSync(path.join(this.ctx.baseDir, vercelSatoriFont.path + "")),
      };
      delete font.path;
      vercelSatoriFonts.push(font);
    }
    this.vercelSatoriFonts = vercelSatoriFonts;
  }

  private buildRendererRequestHeaders(cmdCtx: CmdCtx) {
    return {
      headers: cmdCtx.source.expertMode ? cmdCtx.source.expert.rendererRequestHeaders : undefined,
    };
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
          elements.push(await this.cmdHttp.urlToBase64(cmdCtx, item, this.buildRendererRequestHeaders(cmdCtx)));
        }
      }

      return h.parse(elements.map((src) => h[type](src)).join(""));
    };
  }

  private async downloadReactElementImgSrc(
    cmdCtx: CmdCtx,
    reactElement: ReactElement,
    isRoot: boolean = true,
  ): Promise<ReactElement> {
    if (cmdCtx.source.expertMode && !cmdCtx.source.expert.renderedMediaUrlToBase64) {
      return reactElement;
    }
    if (isRoot) {
      reactElement = await Objects.clone(reactElement);
    }
    if (reactElement.type === "img") {
      if (Strings.isBlank(reactElement.props.src)) {
        return reactElement;
      }
      const res = await this.cmdHttp.loadUrl(cmdCtx, reactElement.props.src, this.buildRendererRequestHeaders(cmdCtx));
      reactElement.props.src = res.data;
      return reactElement;
    }
    if (!Array.isArray(reactElement.props.children)) {
      return reactElement;
    }
    for (const child of reactElement.props.children) {
      if (child?.type) {
        await this.downloadReactElementImgSrc(cmdCtx, child, false);
      }
    }
    return reactElement;
  }

  private async ejs(cmdCtx: CmdCtx, resData: ResData, ejsTemplate: string) {
    if (!ejsTemplate) {
      return JSON.stringify(resData);
    }
    const code = await render(ejsTemplate, this.cmdCommon.buildCodeRunnerArgs(cmdCtx, { data: resData }), {
      async: true,
      rmWhitespace: true,
    });
    return code.replace(/\n+/g, "\n");
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
        const code = await this.ejs(cmdCtx, resData, cmdCtx.source.ejsTemplate);
        return h.parse(code);
      },
    },
    cmdLink: {
      r: async (cmdCtx, resData) => {
        if (Strings.isBlank(cmdCtx.source.cmdLink)) {
          return null;
        }
        let cmdLinks: string[] = [await this.cmdCommon.formatOption(cmdCtx, cmdCtx.source.cmdLink, resData)];
        if (cmdCtx.source.multipleCmd) {
          cmdLinks = cmdLinks[0].split(/[\r\n]/g);
        }
        for (const cmdLink of cmdLinks) {
          await cmdCtx.smallSession.execute(cmdLink);
        }
        return null;
      },
    },
    puppeteer: {
      r: async (cmdCtx, resData) => {
        const page = await this.ctx.puppeteer.page();
        const config = cmdCtx.source.rendererPuppeteer;
        try {
          const obj = this.cmdCommon.buildCodeRunnerValues(cmdCtx, { data: resData });
          await page.evaluate((obj) => (window["_netGet"] = obj), obj);
          await page.evaluateOnNewDocument((obj) => (window["_netGet"] = obj), obj);

          if (config.rendererType === "url") {
            await page.goto(Objects.flatten(resData)[0]);
          } else if (config.rendererType === "html") {
            const code = Array.isArray(resData) ? resData.join("") : JSON.stringify(resData);
            await page.setContent(code);
          } else if (config.rendererType === "ejs") {
            const code = await this.ejs(cmdCtx, resData, config.ejsTemplate);
            await page.setContent(code);
          }
          await page.waitForNetworkIdle();

          if (config.waitType === "function") {
            await page.waitForFunction(`async ()=>{${config.waitFn}}`, {
              timeout: config.waitTimeout,
            });
          } else if (config.waitType === "selector") {
            await page.waitForSelector(config.waitSelector || "body", {
              timeout: config.waitTimeout,
            });
          } else if (config.waitType === "sleep") {
            await this.ctx.sleep(config.waitTime);
          }
          const ele = await page.$(config.screenshotSelector || "body");
          const clip = await ele.boundingBox();
          const screenshot = await page.screenshot({
            clip,
            omitBackground: config.screenshotOmitBackground,
          });
          return [h.image(screenshot, "image/png")];
        } finally {
          await page?.close();
        }
      },
    },
    vercelSatori: {
      r: async (cmdCtx, resData) => {
        const config = cmdCtx.source.rendererVercelSatori;

        let reactElement: ReactElement;
        if (config.rendererType === "ejs") {
          reactElement = this.ctx.vercelSatoriPngService.htmlToReactElement(
            await this.ejs(cmdCtx, resData, config.ejsTemplate),
          );
        } else if (config.rendererType === "jsx") {
          reactElement = await this.ctx.vercelSatoriPngService.jsxToReactElement(
            config.jsx,
            this.cmdCommon.buildCodeRunnerArgs(cmdCtx, { data: resData }),
          );
        }

        reactElement = await this.downloadReactElementImgSrc(cmdCtx, reactElement);

        const options: ImageOptions = {
          width: config.width,
          height: config.height,
          emoji: config.emoji,
          debug: config.debug,
          fonts: this.vercelSatoriFonts,
        };

        if (!options.width) {
          let width = reactElement.props.style.width;
          if (width && !(width + "").trim().endsWith("%")) {
            options.width = typeof width === "number" ? width : parseInt((width + "").replace(/\D/g, ""));
          } else {
            width = reactElement.props.width;
            if (width && !(width + "").trim().endsWith("%")) {
              options.width = typeof width === "number" ? width : parseInt((width + "").replace(/\D/g, ""));
            }
          }
        }
        if (!options.height) {
          let height = reactElement.props.style.height;
          if (height && !(height + "").trim().endsWith("%")) {
            options.height = typeof height === "number" ? height : parseInt((height + "").replace(/\D/g, ""));
          } else {
            height = reactElement.props.height;
            if (height && !(height + "").trim().endsWith("%")) {
              options.height = typeof height === "number" ? height : parseInt((height + "").replace(/\D/g, ""));
            }
          }
        }

        const readable = await this.ctx.vercelSatoriPngService.reactElementToPng(reactElement, options);
        return [h.image((await readable.toArray())[0], "image/png")];
      },
    },
  };

  handleMsgPacking(source: CmdSource, elements: h[]): h[] {
    if (!elements) {
      return elements;
    }
    const msgPackingType =
      source.messagePackingType !== "inherit" ? source.messagePackingType : this.config.messagePackingType;

    if (!msgPackingType || msgPackingType === "none") {
      return elements;
    }
    if (!(elements instanceof Array)) {
      elements = [elements];
    }
    if (msgPackingType === "multiple" && elements.length < 2) {
      return elements;
    }

    const forward = h.parse("<message forward></message>");
    forward[0].children.push(
      ...elements.map((f) => {
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
