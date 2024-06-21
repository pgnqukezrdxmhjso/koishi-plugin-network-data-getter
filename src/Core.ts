import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

import {Argv, Context, Element, Fragment, HTTP, Session} from "koishi";
import * as OTPAuth from "otpauth";

import {Config, CmdSource, OptionValue, CommandArg, CommandOption} from "./config";
import {cmdResData} from "./CmdResData";
import Arrays from "./utils/Arrays";
import {rendered} from "./Renderer";
import {cmdReq} from "./CmdReq";
import {logger} from "./logger";
import {Channel, GuildMember} from "@satorijs/protocol";
import Strings from "./utils/Strings";
import KoishiUtil from "./utils/KoishiUtil";


export interface PresetPool {
  presetConstantPool: Record<string, OptionValue>;
  presetConstantPoolFnArg: string;
  presetFnPool: Record<string, Function>;
  presetFnPoolFnArg: string;
}

type OptionInfoValue = OptionValue | GuildMember | Channel

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

const AsyncFunction: FunctionConstructor = (async () => 0).constructor as FunctionConstructor;

async function getGuildMember({userId, session}: {
  userId: string,
  session: Session,
}) {
  let res: GuildMember;
  await KoishiUtil.forList(
    (member) => {
      const nick = member.nick ?? member.user?.nick;
      const name = member.name ?? member.user?.name;
      if (userId !== member.user?.id && userId !== nick && userId !== name) {
        return;
      }
      res = {
        ...member,
        user: {...member.user},
        nick,
        name,
      }
      res.toString = () => res.user.id + ':' + (res.nick ?? res.name)
      return false;
    },
    session.bot, session.bot.getGuildMemberList,
    session.guildId
  );
  if (!res) {
    res = {
      name: userId
    };
    res.toString = () => ":" + userId;
  }
  return res;
}

async function getChannel({channelId, session}: {
  channelId: string,
  session: Session,
}) {
  let res: Channel;
  await KoishiUtil.forList(
    (channel) => {
      if (channelId !== channel.id && channelId !== channel.name) {
        return;
      }
      res = {...channel};
      res.toString = () => res.id + ':' + res.name;
      return false;
    },
    session.bot, session.bot.getChannelList,
    session.guildId
  );
  if (!res) {
    res = {
      id: channelId,
      name: channelId,
      type: undefined,
    };
    res.toString = () => ":" + channelId;
  }
  return channelId;
}

async function handleOptionInfoData({optionInfo, option, argv}: {
  optionInfo: OptionInfo,
  option: CommandArg | CommandOption
  argv: Argv
}) {
  if (typeof optionInfo.value !== 'string') {
    return;
  }
  const value = optionInfo.value.trim();
  if (option.type === 'user') {
    const u = value.split(':')[1];
    if (Strings.isBlank(u)) {
      return;
    }
    optionInfo.value = await getGuildMember({userId: u, session: argv.session});
  } else if (option.type === 'channel') {
    const c = value.split(':')[1];
    if (Strings.isBlank(c)) {
      return;
    }
    optionInfo.value = await getChannel({channelId: c, session: argv.session});
  } else if (
    (/^<(img|audio|video|file)/).test(value.trim())
    && !(/&lt;(img|audio|video|file)/).test(argv.source)
  ) {
    const element = Element.parse(value.trim())[0];
    const imgSrc = element.attrs['src'];
    if (Strings.isBlank(imgSrc)) {
      return;
    }
    optionInfo.value = imgSrc;
    optionInfo.isFileUrl = true;
    for (let attrsKey in element.attrs) {
      if (attrsKey.toLowerCase().includes('file')) {
        optionInfo.fileName = (element.attrs[attrsKey] + '').trim();
        break;
      }
    }
  }
}

async function handleOptionInfos({source, argv}: { source: CmdSource, argv: Argv }): Promise<OptionInfoMap> {
  const map: Record<string, OptionInfoValue> = {};
  const infoMap: Record<string, OptionInfo> = {};
  const fnArgs = [];
  const expert = source.expert;
  if (source.expertMode && expert) {
    for (const option of expert.commandOptions) {
      const optionInfo: OptionInfo = {
        value: argv.options?.[option.name],
        autoOverwrite: option.autoOverwrite,
        overwriteKey: option.overwriteKey,
      };
      await handleOptionInfoData({
        optionInfo,
        option,
        argv,
      });
      map[option.name] = optionInfo.value;
      infoMap[option.name] = optionInfo;
    }

    for (const arg of expert.commandArgs) {
      const i = expert.commandArgs.indexOf(arg);
      const optionInfo: OptionInfo = {
        value: argv.args?.[i],
        autoOverwrite: arg.autoOverwrite,
        overwriteKey: arg.overwriteKey,
      }
      await handleOptionInfoData({
        optionInfo,
        option: arg,
        argv,
      });
      map[arg.name] = optionInfo.value;
      infoMap[arg.name] = optionInfo;
      map['$' + i] = optionInfo.value;
      infoMap['$' + i] = optionInfo;
    }
  }

  for (const key in infoMap) {
    fnArgs.push(key);
  }
  return {infoMap, map, fnArg: '{' + fnArgs.join(',') + '}={}'};
}

export default function () {

  const recalls = new Set<NodeJS.Timeout>();
  let presetPool: PresetPool = {
    presetConstantPool: {},
    presetConstantPoolFnArg: '{}={}',
    presetFnPool: {},
    presetFnPoolFnArg: '{}={}',
  }

  function initPresetConstants({ctx, config}: {
    ctx: Context,
    config: Config
  }) {
    if (!config.expertMode || !config.expert || Arrays.isEmpty(config.expert.presetConstants)) {
      return;
    }
    config.expert.presetConstants.forEach(presetConstant => {
      if (!presetConstant) {
        return;
      }
      if (presetConstant.type !== 'file') {
        presetPool.presetConstantPool[presetConstant.name] = presetConstant.value;
        return;
      }
      const filePath = path.join(ctx.baseDir, presetConstant.value + '');
      Object.defineProperty(presetPool.presetConstantPool, presetConstant.name, {
        configurable: true,
        enumerable: true,
        get: () => fs.readFileSync(filePath),
      })
    });
    presetPool.presetConstantPoolFnArg = '{' + Object.keys(presetPool.presetConstantPool).join(',') + '}={}';
  }

  function initPresetFns({ctx, config}: { ctx: Context, config: Config }) {
    if (!config.expertMode || !config.expert || Arrays.isEmpty(config.expert.presetFns)) {
      return;
    }
    config.expert.presetFns.forEach(presetFn => {
      if (!presetFn) {
        return
      }
      const fn =
        (presetFn.async ? AsyncFunction : Function)(
          '{crypto,OTPAuth,http}', presetPool.presetConstantPoolFnArg, presetFn.args, presetFn.body
        );
      presetPool.presetFnPool[presetFn.name] = fn.bind(fn, {
        crypto,
        OTPAuth,
        http: ctx.http
      }, presetPool.presetConstantPool ?? {});
    });
    presetPool.presetFnPoolFnArg = '{' + Object.keys(presetPool.presetFnPool).join(',') + '}={}';
  }


  function initConfig({ctx, config}: {
    ctx: Context,
    config: Config
  }) {
    initPresetConstants({ctx, config});
    initPresetFns({ctx, config});
  }

  function onDispose() {
    presetPool = null;
    recalls.forEach(timeout => clearTimeout(timeout));
    recalls.clear();
  }

  async function send({ctx, config, source, argv}: {
    ctx: Context,
    config: Config,
    source: CmdSource,
    argv: Argv,
  }) {
    logger.debug('args: ', argv.args);
    logger.debug('options: ', argv.options);

    const session = argv.session;
    if (config.gettingTips != source.reverseGettingTips) {
      await session.send(`獲取 ${source.command} 中，請稍候...`);
    }

    const optionInfoMap = await handleOptionInfos({source, argv});

    const res: HTTP.Response = await cmdReq({
      ctx, config, source, presetPool, session, optionInfoMap
    });
    if (res.status > 300 || res.status < 200) {
      const msg = JSON.stringify(res.data);
      throw new Error(`${msg} (${res.statusText})`);
    }

    const resData = cmdResData(source, res);
    const fragment: Fragment = await rendered({
      ctx, config, source, presetPool, session, optionInfoMap, resData
    });

    const [msg] = await session.send(fragment);
    if (source.recall > 0) {
      const timeout = setTimeout(() => session.bot.deleteMessage(session.channelId, msg), source.recall * 60000);
      recalls.add(timeout);
    }
  }


  return {send, initConfig, onDispose};

}
