import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

import {Argv, Context, Element, Fragment, HTTP, Session} from "koishi";
import * as OTPAuth from "otpauth";

import {CmdSource, CommandArg, CommandOption, Config, OptionValue} from "./Config";
import {cmdResData} from "./CmdResData";
import Arrays from "./utils/Arrays";
import {rendered} from "./Renderer";
import {cmdReq} from "./CmdReq";
import {logger} from "./logger";
import {Channel, GuildMember} from "@satorijs/protocol";
import Strings from "./utils/Strings";
import KoishiUtil from "./utils/KoishiUtil";
import Objects from "./utils/Objects";


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

export interface CmdCtx {
  ctx: Context;
  config: Config;
  source: CmdSource;
  presetPool: PresetPool;
  session: Session;
  optionInfoMap: OptionInfoMap;
}

const AsyncFunction: FunctionConstructor = (async () => 0).constructor as FunctionConstructor;

async function getGuildMember({userId, session}: {
  userId: string,
  session: Session,
}) {
  let res: GuildMember;
  await KoishiUtil.forList(
    (member) => {
      const nick = member.nick || member.user?.nick;
      const name = member.name || member.user?.name;
      if (userId !== member.user?.id && userId !== nick && userId !== name) {
        return;
      }
      res = {
        ...member,
        user: {...member.user},
        nick,
        name,
      }
      res.toString = () => res.user.id + ':' + (res.nick || res.name)
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
  const optionInfoMap: OptionInfoMap = {
    map: {},
    infoMap: {},
    fnArg: '{}={}',
  }
  if (!source.expertMode || !source.expert) {
    return optionInfoMap;
  }

  for (const option of source.expert.commandOptions) {
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
    optionInfoMap.map[option.name] = optionInfo.value;
    optionInfoMap.infoMap[option.name] = optionInfo;
  }

  for (const arg of source.expert.commandArgs) {
    const i = source.expert.commandArgs.indexOf(arg);
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
    optionInfoMap.map[arg.name] = optionInfo.value;
    optionInfoMap.infoMap[arg.name] = optionInfo;
    optionInfoMap.map['$' + i] = optionInfo.value;
    optionInfoMap.infoMap['$' + i] = optionInfo;
  }
  optionInfoMap.fnArg = '{' + Object.keys(optionInfoMap.infoMap).join(',') + '}={}';

  return optionInfoMap;
}

export async function formatOption(args: CmdCtx & {
  content: string,
  data?: any
}): Promise<string> {
  let {
    content, data,
    presetPool, session, optionInfoMap
  } = args;
  const contentList = [];
  content = content
    .replace(/<%=([\s\S]+?)%>/g, function (match: string, p1: string) {
      contentList.push(p1);
      return match;
    });
  if (contentList.length < 1) {
    return content;
  }

  const fnArgTexts = ['$e', presetPool.presetConstantPoolFnArg, presetPool.presetFnPoolFnArg];
  const fnArgs: any[] = [session.event, presetPool.presetConstantPool ?? {}, presetPool.presetFnPool ?? {}];
  if (optionInfoMap) {
    fnArgTexts.push(optionInfoMap.fnArg);
    fnArgs.push(optionInfoMap.map ?? {});
  }
  if (Objects.isNotNull(data)) {
    fnArgTexts.push('$data');
    fnArgs.push(data);
  }

  const resMap = {};
  for (let i = 0; i < contentList.length; i++) {
    const item = contentList[i];
    resMap[i + '_' + item] = await AsyncFunction(...fnArgTexts, 'return ' + item.replace(/\n/g, '\\n'))(...fnArgs);
  }

  let i = 0;
  content = content.replace(/<%=([\s\S]+?)%>/g, function (match: string, p1: string) {
    return resMap[i++ + '_' + p1] ?? '';
  });

  return content;
}

export async function formatObjOption(args: CmdCtx & {
  obj: {},
  compelString: boolean,
}) {
  const {obj, compelString, optionInfoMap} = args;
  await Objects.thoroughForEach(obj, async (value, key, obj) => {
    if (typeof value === 'string') {
      obj[key] = await formatOption({...args, content: obj[key],});
    }
  });

  if (optionInfoMap) for (let name in optionInfoMap.infoMap) {
    const optionInfo = optionInfoMap.infoMap[name];
    const oKey = optionInfo.overwriteKey || name;
    if (
      !optionInfo.autoOverwrite
      || typeof optionInfo.value === 'undefined'
      || typeof eval(`obj?.${oKey.replace(/(?<!\?)\./g, '?.').replace(/(?<!\?.)\[/g, '?.[')}`) === 'undefined'
    ) {
      continue;
    }
    try {
      eval(`obj.${oKey} = optionInfo.value` + (compelString ? '+""' : ''));
    } catch (e) {
    }
  }

  return obj;
}

export default function () {

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
    const cmdCtx: CmdCtx = {ctx, config, source, presetPool, session, optionInfoMap};

    const res: HTTP.Response = await cmdReq(cmdCtx);
    if (res.status > 300 || res.status < 200) {
      const msg = JSON.stringify(res.data);
      throw new Error(`${msg} (${res.statusText})`);
    }

    const resData = cmdResData(source, res);
    const fragment: Fragment = await rendered({...cmdCtx, resData});

    if (fragment) {
      const [msg] = await session.send(fragment);
      if (source.recall > 0) {
        ctx.setTimeout(() => session.bot.deleteMessage(session.channelId, msg), source.recall * 60000);
      }
    }
  }

  return {send, initConfig, onDispose};
}
