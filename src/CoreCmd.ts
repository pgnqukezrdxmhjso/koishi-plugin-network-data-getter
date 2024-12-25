import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

import { Argv, Command, Context, h, HTTP, Session } from "koishi";
import { Channel, GuildMember } from "@satorijs/protocol";
import * as OTPAuth from "otpauth";

import { CmdSource, CommandArg, CommandOption, Config, OptionValue } from "./Config";
import CmdRenderer from "./CmdRenderer";
import CmdResData, { ResData } from "./CmdResData";
import CmdCommon, { BizError } from "./CmdCommon";
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
  tmpPool: Record<string, any>;
  isUserCall: boolean;
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
  private allCmdName: Set<string>;
  private allCommand: { [key in string]: Command };

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
    this.registerTask();
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
    if (!this.config.expertMode || !this.config.expert || Arrays.isEmpty(this.config.expert.presetFns)) {
      return;
    }
    this.config.expert.presetFns.forEach((presetFn) => {
      if (!presetFn) {
        return;
      }
      const moduleMap = {
        crypto,
        OTPAuth,
        http: this.ctx.http,
        cache: this.ctx.cache,
        logger: this.ctx.logger,
      };

      const fn = (presetFn.async ? AsyncFunction : Function)(
        `{${Object.keys(moduleMap).join(",")}}`,
        this.presetPool.presetConstantPoolFnArg,
        presetFn.args,
        presetFn.body,
      );
      this.presetPool.presetFnPool[presetFn.name] = fn.bind(fn, moduleMap, this.presetPool.presetConstantPool ?? {});
    });
    this.presetPool.presetFnPoolFnArg = "{" + Object.keys(this.presetPool.presetFnPool).join(",") + "}={}";
  }

  private initAllCmdName() {
    this.allCmdName = new Set();
    this.config.sources?.forEach((source) => {
      this.allCmdName.add(source.command);
      source.alias?.forEach((alias) => {
        this.allCmdName.add(alias);
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
        if (!this.allCmdName.has(prefix)) {
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
    let commandPrefix = "";
    if (Strings.isNotBlank(this.config.commandGroup)) {
      commandPrefix = this.config.commandGroup + "/";
    }
    this.allCommand = {};
    this.config.sources.forEach((source) => {
      let def = commandPrefix + source.command;
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
        .action(async (argv) => this.runCmd(source, argv, true));
      this.allCommand[source.command] = command;

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
    let element = `執行指令 ${source.command} 失敗: `;
    switch (httpErrorShowToMsg) {
      case "hide": {
        throw e;
      }
      case "show": {
        const res = e.response;
        if (!res) {
          element += e.message;
        } else {
          element += res.statusText || "";
          if (res.data) {
            element += " " + (typeof res.data === "object" ? JSON.stringify(res.data) : res.data);
          }
        }
        break;
      }
      case "function": {
        if (!source.httpErrorShowToMsgFn) {
          throw e;
        }
        element += await this.cmdCommon.generateCodeRunner(cmdCtx, {
          response: e.response,
          error: e,
        })(source.httpErrorShowToMsgFn);
        break;
      }
    }
    return h.parse(element);
  }

  private async cmdTopic(source: CmdSource, argv: Argv): Promise<h[]> {
    if (source.msgSendMode !== "topic" || typeof argv.options["topic"] !== "boolean") {
      return null;
    }
    await this.ctx.messageTopicService.topicSubscribe({
      platform: argv.session.bot.platform,
      selfId: argv.session.bot.selfId,
      channelId: argv.session.channelId,
      bindingKey: source.msgTopic || "net-get." + source.command,
      enable: argv.options["topic"],
    });
    return h.parse((argv.options["topic"] ? "訂閱" : "退訂") + "成功");
  }

  private async runCmd(source: CmdSource, argv: Argv, isUserCall: boolean, smallSession?: SmallSession): Promise<h[]> {
    this.pluginEventEmitter.emit("cmd-action", argv);
    this.ctx.logger.debug("args: ", argv.args);
    this.ctx.logger.debug("options: ", argv.options);

    const topicMsg = await this.cmdTopic(source, argv);
    if (topicMsg) {
      return topicMsg;
    }

    if (isUserCall && source.expertMode && source.expert?.disableUserCall) {
      return;
    }

    const session: Session = argv.session;
    let msgId: string;
    if (session?.send && this.config.gettingTips != source.reverseGettingTips) {
      [msgId] = await session.send(`獲取 ${source.command} 中，請稍候...`);
    }

    if (!smallSession) {
      smallSession = {
        platform: session?.platform,
        event: session?.event,
        content: session?.content,
        execute: session?.execute.bind(session),
      };
    }

    const cmdCtx: CmdCtx = {
      source,
      presetPool: this.presetPool,
      smallSession,
      optionInfoMap: null,
      tmpPool: {},
      isUserCall,
    };
    let elements: h[];
    let isError: boolean = false;
    try {
      cmdCtx.optionInfoMap = await this.handleOptionInfos(source, argv);
      const res: HTTP.Response = await this.cmdReq.cmdReq(cmdCtx);
      const resData: ResData = await this.cmdResData.cmdResData(cmdCtx, res);
      elements = await this.cmdRenderer.rendered(cmdCtx, resData);
    } catch (e) {
      if (e instanceof BizError) {
        if (e.type === "hookBlock") {
          this.ctx.logger.info(e.message);
          return;
        } else if (e.type === "hookBlock-msg") {
          return h.parse(e.message);
        } else if (e.type === "resModified") {
          this.ctx.logger.debug(e.message);
          return;
        }
      }
      isError = true;
      elements = await this.sendHttpError(cmdCtx, e);
      if (!session?.send) {
        throw new Error(elements + "");
      }
    }

    if (!elements) {
      return;
    }
    if (msgId) {
      await session.bot.deleteMessage(session.channelId, msgId);
    }

    if (!isError && this.ctx.messageTopicService && source.msgSendMode === "topic") {
      await this.ctx.messageTopicService.sendMessageToTopic(source.msgTopic || "net-get." + source.command, elements, {
        retractTime: source.recall > 0 ? source.recall * 60000 : undefined,
      });
      elements = h.parse("訊息推送成功");
    }
    if (!session?.send) {
      return elements;
    }
    const msgIds: string[] = await session.send(elements);
    if (source.recall > 0) {
      this.ctx.setTimeout(
        () => msgIds.forEach((mId: string) => session.bot.deleteMessage(session.channelId, mId)),
        source.recall * 60000,
      );
    }
  }

  private registerTask() {
    const registerList: CmdSource[] = this.config.sources.filter((source) => {
      const expert = source.expert;
      if (!expert?.scheduledTask || Strings.isBlank(expert.cron)) {
        return false;
      }
      const refuseText = source.command + " 指令, 註冊定時執行失敗: ";
      if (source.msgSendMode !== "topic") {
        this.ctx.logger.info(refuseText + "訊息傳送模式 不是 主題推送");
        return false;
      }
      if (source.sendType === "cmdLink") {
        this.ctx.logger.info(refuseText + "渲染型別 不能是 指令鏈");
        return false;
      }

      const argv = this.allCommand[source.command].parse(expert.scheduledTaskContent ?? "");
      if (Strings.isNotBlank(argv.error)) {
        this.ctx.logger.info(refuseText + "執行的內容解析出現錯誤 " + argv.error);
        return false;
      }
      return true;
    });

    if (registerList.length > 0) {
      this.ctx.inject(["cron", "messageTopicService"], () => {
        registerList.forEach((source: CmdSource) => {
          this.ctx.logger.info("註冊定時執行: " + source.command);
          this.ctx.cron(source.expert.cron, async () => {
            await this.runTask(source, this.allCommand[source.command]);
          });
        });
      });
    }
  }

  private async runTask(source: CmdSource, command: Command) {
    const argv = command.parse(source.expert.scheduledTaskContent ?? "");
    const elements = await this.runCmd(source, argv, false, {
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
    });
    if (elements) {
      this.ctx.logger.info(source.command + " " + elements);
    }
  }
}
