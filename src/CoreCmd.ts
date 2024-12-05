import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

import { Argv, Command, Context, Fragment, h, HTTP, Session } from "koishi";
import { Channel, GuildMember } from "@satorijs/protocol";
import * as OTPAuth from "otpauth";

import { CmdSource, CommandArg, CommandOption, Config, OptionValue } from "./Config";
import CmdRenderer from "./CmdRenderer";
import CmdResData from "./CmdResData";
import CmdCommon from "./CmdCommon";
import CmdReq from "./CmdReq";
import Arrays from "./utils/Arrays";
import Strings from "./utils/Strings";
import { PluginEventEmitter } from "./index";
import { getChannel, getGuildMember } from "./KoishiData";
import { BeanHelper, BeanTypeInterface } from "./utils/BeanHelper";

declare module "./" {
  // noinspection JSUnusedGlobalSymbols
  interface PluginEventEmitterEventMap {
    "cmd-action": [Argv];
  }
}

export interface PresetPool {
  presetConstantPool: Record<string, OptionValue>;
  presetConstantPoolFnArg: string;
  presetFnPool: Record<string, () => void>;
  presetFnPoolFnArg: string;
}

type OptionInfoValue = OptionValue | GuildMember | Channel;

interface OptionInfo {
  value: OptionInfoValue;
  fileName?: string;
  isFileUrl?: boolean;
  autoOverwrite: boolean;
  overwriteKey?: string;
}

export interface OptionInfoMap {
  infoMap: Record<string, OptionInfo>;
  map: Record<string, OptionInfoValue>;
  fnArg: string;
}

export interface SmallSession {
  platform: Session["platform"];
  event: Session["event"];
  content: Session["content"];
  execute: Session["execute"];
}

export interface CmdCtx {
  source: CmdSource;
  presetPool: PresetPool;
  optionInfoMap: OptionInfoMap;
  smallSession: SmallSession;
}

const AsyncFunction: FunctionConstructor = (async () => 0).constructor as FunctionConstructor;

export default class CoreCmd implements BeanTypeInterface {
  private ctx: Context;
  private config: Config;
  private pluginEventEmitter: PluginEventEmitter;
  private cmdReq: CmdReq;
  private cmdResData: CmdResData;
  private cmdRenderer: CmdRenderer;
  private cmdCommon: CmdCommon;
  private presetPool: PresetPool = {
    presetConstantPool: {},
    presetConstantPoolFnArg: "{}={}",
    presetFnPool: {},
    presetFnPoolFnArg: "{}={}",
  };
  private allCmd: Set<string>;

  constructor(beanHelper: BeanHelper) {
    this.ctx = beanHelper.getByName("ctx");
    this.config = beanHelper.getByName("config");
    this.pluginEventEmitter = beanHelper.getByName("pluginEventEmitter");
    this.cmdReq = beanHelper.instance(CmdReq);
    this.cmdResData = beanHelper.instance(CmdResData);
    this.cmdRenderer = beanHelper.instance(CmdRenderer);
    this.cmdCommon = beanHelper.instance(CmdCommon);
  }

  start() {
    this.initPresetConstants();
    this.initPresetFns();
    this.initAllCmdName();
    this.initHandleQuoteMessage();
    this.registerCmd();
  }

  private initPresetConstants() {
    const { ctx, config, presetPool } = this;
    if (!config.expertMode || !config.expert || Arrays.isEmpty(config.expert.presetConstants)) {
      return;
    }
    config.expert.presetConstants.forEach((presetConstant) => {
      if (!presetConstant) {
        return;
      }
      if (presetConstant.type !== "file") {
        presetPool.presetConstantPool[presetConstant.name] = presetConstant.value;
        return;
      }
      const filePath = path.join(ctx.baseDir, presetConstant.value + "");
      Object.defineProperty(presetPool.presetConstantPool, presetConstant.name, {
        configurable: true,
        enumerable: true,
        get: () => fs.readFileSync(filePath),
      });
    });
    presetPool.presetConstantPoolFnArg = "{" + Object.keys(presetPool.presetConstantPool).join(",") + "}={}";
  }

  private initPresetFns() {
    const { ctx, config, presetPool } = this;
    if (!config.expertMode || !config.expert || Arrays.isEmpty(config.expert.presetFns)) {
      return;
    }
    config.expert.presetFns.forEach((presetFn) => {
      if (!presetFn) {
        return;
      }
      const moduleMap = {
        crypto,
        OTPAuth,
        http: ctx.http,
      };

      const fn = (presetFn.async ? AsyncFunction : Function)(
        `{${Object.keys(moduleMap).join(",")}}`,
        presetPool.presetConstantPoolFnArg,
        presetFn.args,
        presetFn.body,
      );
      presetPool.presetFnPool[presetFn.name] = fn.bind(fn, moduleMap, presetPool.presetConstantPool ?? {});
    });
    presetPool.presetFnPoolFnArg = "{" + Object.keys(presetPool.presetFnPool).join(",") + "}={}";
  }

  private initAllCmdName() {
    this.allCmd = new Set();
    this.config.sources?.forEach((source) => {
      this.allCmd.add(source.command);
      source.alias?.forEach((alias) => {
        this.allCmd.add(alias);
      });
    });
  }

  private initHandleQuoteMessage() {
    this.ctx.on(
      "message",
      (session) => {
        if (!session.quote) {
          return;
        }
        const elements = [...session.elements];
        const firstTextIndex = elements.findIndex((ele) => ele.type === "text");
        if (firstTextIndex > 0) {
          elements.splice(0, firstTextIndex);
        }
        let cmd: string = elements[0].attrs["content"]?.trim() + "";
        session.app.config.prefix?.forEach((p: string) => {
          cmd = cmd.replace(new RegExp("^" + p), "").trim();
        });
        const prefix = cmd.split(/\s/)[0];
        if (!this.allCmd.has(prefix)) {
          return;
        }
        elements.push(...session.quote.elements);
        delete session.event.message.quote;
        const lastIndex = elements.length - 1;
        elements.forEach((element, index) => {
          if (element.type !== "text") {
            return;
          }
          let content = (element.attrs?.content + "").trim();
          if (index < lastIndex) {
            content = content + " ";
          }
          if (index !== 0 && elements[index - 1].type !== "text") {
            content = " " + content;
          }
          element.attrs.content = content;
        });
        session.elements.length = 0;
        session.elements.push(...elements);
        session.event.message.content = session.elements.join("");
      },
      true,
    );
  }

  private registerCmd() {
    this.config.sources.forEach((source) => {
      let def = source.command;
      if (source.expertMode) {
        source.expert?.commandArgs?.forEach((arg) => {
          def +=
            " " +
            (arg.required ? "<" : "[") +
            arg.name +
            ":" +
            arg.type +
            (arg.required ? ">" : "]") +
            (Strings.isNotBlank(arg.desc) ? " " + arg.desc : "");
        });
      }

      const command = this.ctx
        .command(def, source.desc ?? "", {
          checkUnknown: true,
          checkArgCount: true,
          handleError: (err, { command }) => {
            this.ctx.logger.error(err);
            return `執行指令 ${command.displayName} 失敗`;
          },
        })
        .alias(...source.alias)
        .action(async (argv) => this.runCmd(source, argv));

      if (source.expertMode) {
        source.expert?.commandOptions?.forEach((option) => {
          const desc = [];
          const existValue = typeof option.value !== "undefined";
          if (option.acronym) {
            desc.push((option.acronym.length < 2 ? "" : "-") + `-${option.acronym}`);
          }
          if (!existValue && option.type !== "boolean") {
            desc.push(`[${option.name}:${option.type}]`);
          }
          if (Strings.isNotBlank(option.desc)) {
            desc.push(option.desc);
          }
          const config: Argv.OptionConfig = {};
          if (existValue) {
            config.value = option.value;
          }
          command.option(option.name, desc.join(" "), config);
        });
        if (source.expert?.scheduledTask) {
          this.registerTask(source, command);
        }
      }

      if (source.msgSendMode === "topic") {
        command.option("topic", "--topic-on 訂閱推送", { value: true });
        command.option("topic", "--topic-off 退訂推送", { value: false });
      }
    });
  }

  private async buildOptionInfo(value: any, option: CommandArg | CommandOption, argv: Argv) {
    const optionInfo: OptionInfo = {
      value,
      autoOverwrite: option.autoOverwrite,
      overwriteKey: option.overwriteKey,
    };

    if (typeof value !== "string") {
      return optionInfo;
    }

    const val = value.trim();
    if (option.type === "user") {
      const u = val.split(":").pop();
      if (Strings.isNotBlank(u)) {
        optionInfo.value = await getGuildMember(argv.session, u);
      }
    } else if (option.type === "channel") {
      const c = val.split(":").pop();
      if (Strings.isNotBlank(c)) {
        optionInfo.value = await getChannel(argv.session, c);
      }
    } else if (/^<(img|audio|video|file)/.test(val) && !/&lt;(img|audio|video|file)/.test(argv.source)) {
      const element = h.parse(val)[0];
      const imgSrc = element.attrs["src"];
      if (Strings.isNotBlank(imgSrc)) {
        optionInfo.value = imgSrc;
        optionInfo.isFileUrl = true;
        for (const attrsKey in element.attrs) {
          if (attrsKey.toLowerCase().includes("file")) {
            optionInfo.fileName = (element.attrs[attrsKey] + "").trim();
            break;
          }
        }
      }
    }

    return optionInfo;
  }

  private async handleOptionInfos(source: CmdSource, argv: Argv): Promise<OptionInfoMap> {
    const optionInfoMap: OptionInfoMap = {
      map: {},
      infoMap: {},
      fnArg: "{}={}",
    };
    if (!source.expertMode || !source.expert) {
      return optionInfoMap;
    }

    for (const option of source.expert.commandOptions) {
      const optionInfo = await this.buildOptionInfo(argv.options?.[option.name], option, argv);
      optionInfoMap.map[option.name] = optionInfo.value;
      optionInfoMap.infoMap[option.name] = optionInfo;
    }

    for (const arg of source.expert.commandArgs) {
      const i = source.expert.commandArgs.indexOf(arg);
      const optionInfo = await this.buildOptionInfo(argv.args?.[i], arg, argv);
      optionInfoMap.map[arg.name] = optionInfo.value;
      optionInfoMap.infoMap[arg.name] = optionInfo;
      optionInfoMap.map["$" + i] = optionInfo.value;
      optionInfoMap.infoMap["$" + i] = optionInfo;
    }
    optionInfoMap.fnArg = "{" + Object.keys(optionInfoMap.infoMap).join(",") + "}={}";

    return optionInfoMap;
  }

  private async sendHttpError(cmdCtx: CmdCtx, e: Error) {
    if (!HTTP.Error.is(e)) {
      throw e;
    }
    const { source } = cmdCtx;
    const httpErrorShowToMsg =
      source.httpErrorShowToMsg !== "inherit" ? source.httpErrorShowToMsg : this.config.httpErrorShowToMsg;
    let fragment = `執行指令 ${source.command} 失敗: `;
    switch (httpErrorShowToMsg) {
      case "hide": {
        throw e;
      }
      case "show": {
        const res = e.response;
        if (!res) {
          fragment += e.message;
        } else {
          fragment += res.statusText || "";
          if (res.data) {
            fragment += " " + (typeof res.data === "object" ? JSON.stringify(res.data) : res.data);
          }
        }
        break;
      }
      case "function": {
        if (!source.httpErrorShowToMsgFn) {
          throw e;
        }
        fragment += await this.cmdCommon.generateCodeRunner(cmdCtx, {
          response: e.response,
          error: e,
        })(source.httpErrorShowToMsgFn);
        break;
      }
    }
    return h.parse(fragment);
  }

  private async runCmd(source: CmdSource, argv: Argv) {
    this.pluginEventEmitter.emit("cmd-action", argv);
    this.ctx.logger.debug("args: ", argv.args);
    this.ctx.logger.debug("options: ", argv.options);

    if (source.msgSendMode === "topic" && typeof argv.options["topic"] === "boolean") {
      await this.ctx.messageTopicService.topicSubscribe({
        platform: argv.session.bot.platform,
        selfId: argv.session.bot.selfId,
        channelId: argv.session.channelId,
        bindingKey: source.msgTopic || "net-get." + source.command,
        enable: argv.options["topic"],
      });
      return (argv.options["topic"] ? "訂閱" : "退訂") + "成功";
    }

    const session = argv.session;
    let msgId: string;
    if (this.config.gettingTips != source.reverseGettingTips) {
      [msgId] = await session.send(`獲取 ${source.command} 中，請稍候...`);
    }

    const cmdCtx: CmdCtx = {
      source,
      presetPool: this.presetPool,
      smallSession: {
        platform: session.platform,
        event: session.event,
        content: session.content,
        execute: session.execute,
      },
      optionInfoMap: null,
    };
    let fragment: Fragment;
    let isError = false;
    try {
      cmdCtx.optionInfoMap = await this.handleOptionInfos(source, argv);
      const res: HTTP.Response = await this.cmdReq.cmdReq(cmdCtx);
      const resData = await this.cmdResData.cmdResData(cmdCtx, res);
      fragment = await this.cmdRenderer.rendered(cmdCtx, resData);
    } catch (e) {
      isError = true;
      fragment = await this.sendHttpError(cmdCtx, e);
    }

    if (!fragment) {
      return;
    }
    if (msgId) {
      await session.bot.deleteMessage(session.channelId, msgId);
    }

    if (!isError && this.ctx.messageTopicService && source.msgSendMode === "topic") {
      await this.ctx.messageTopicService.sendMessageToTopic(source.msgTopic || "net-get." + source.command, fragment, {
        retractTime: source.recall > 0 ? source.recall * 60000 : undefined,
      });
      fragment = "訊息推送成功";
    }

    const msgIds = await session.send(fragment);
    if (source.recall > 0) {
      this.ctx.setTimeout(
        () => msgIds.forEach((mId) => session.bot.deleteMessage(session.channelId, mId)),
        source.recall * 60000,
      );
    }
  }

  private registerTask(source: CmdSource, command: Command) {
    const expert = source.expert;
    if (Strings.isBlank(expert.cron) || Strings.isBlank(expert.scheduledTaskContent)) {
      return;
    }
    const refuseText = source.command + " 指令, 註冊定時執行失敗: ";
    if (!this.ctx.cron) {
      this.ctx.logger.info(refuseText + "cron 服務未載入");
      return;
    }
    if (!this.ctx.messageTopicService) {
      this.ctx.logger.info(refuseText + "messageTopicService 服務未載入");
      return;
    }
    if (source.msgSendMode !== "topic") {
      this.ctx.logger.info(refuseText + "訊息傳送模式 不是 主題推送");
      return;
    }
    if (source.sendType === "cmdLink") {
      this.ctx.logger.info(refuseText + "渲染型別 不能是 指令鏈");
      return;
    }

    const argv = command.parse(expert.scheduledTaskContent);
    if (Strings.isNotBlank(argv.error)) {
      this.ctx.logger.info(refuseText + "執行的內容解析出現錯誤 " + argv.error);
      return;
    }
    this.ctx.cron(expert.cron, async () => {
      await this.runTask(source, command);
    });
  }

  private async runTask(source: CmdSource, command: Command) {
    const argv = command.parse(source.expert.scheduledTaskContent);
    this.ctx.logger.debug("args: ", argv.args);
    this.ctx.logger.debug("options: ", argv.options);

    const cmdCtx: CmdCtx = {
      source,
      presetPool: this.presetPool,
      smallSession: {
        platform: "network-data-getter",
        event: {
          id: Date.now(),
          type: "runTask",
          selfId: "network-data-getter",
          platform: "koishi",
          timestamp: Date.now(),
          argv: {
            name: argv.name,
            arguments: argv.args,
            options: argv.options,
          },
        },
        content: argv.source,
        execute: null,
      },
      optionInfoMap: null,
    };
    cmdCtx.optionInfoMap = await this.handleOptionInfos(source, argv);
    const res: HTTP.Response = await this.cmdReq.cmdReq(cmdCtx);
    const resData = await this.cmdResData.cmdResData(cmdCtx, res);
    const fragment: Fragment = await this.cmdRenderer.rendered(cmdCtx, resData);
    await this.ctx.messageTopicService.sendMessageToTopic(source.msgTopic || "net-get." + source.command, fragment, {
      retractTime: source.recall > 0 ? source.recall * 60000 : undefined,
    });
    this.ctx.logger.info(source.command + " 訊息推送成功");
  }
}
