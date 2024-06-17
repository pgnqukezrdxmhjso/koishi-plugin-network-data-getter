import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import {Argv, Context, Element, HTTP, Session} from "koishi";
import {Channel, GuildMember} from "@satorijs/protocol";
import * as OTPAuth from "otpauth";

import {CommandArg, CommandOption, Config, OptionValue, ProxyConfig, RandomSource} from "./config";
import KoishiUtil from "./utils/KoishiUtil";
import Strings from "./utils/Strings";
import Objects from "./utils/Objects";
import Arrays from "./utils/Arrays";
import Files from "./utils/Files";
import {WorkData} from "./Core";


type OptionInfoValue = OptionValue | GuildMember | Channel

interface OptionInfo {
  value: OptionInfoValue;
  fileName?: string;
  isFileUrl?: boolean;
  autoOverwrite: boolean;
  overwriteKey?: string;
}

interface OptionInfoMap {
  infoMap: Record<string, OptionInfo>;
  map: Record<string, OptionInfoValue>;
  fnArg: string;
}

const AsyncFunction: FunctionConstructor = (async () => 0).constructor as FunctionConstructor;

export default function () {

  const presetConstantPool: Record<string, OptionValue> = {};
  let presetConstantPoolFnArg = '{}={}';

  const presetFnPool: Record<string, Function> = {};
  let presetFnPoolFnArg = '{}={}';

  let cmdHttpClient: HTTP;
  const platformHttpClientPool: Record<string, HTTP> = {};


  function buildHttpClient({ctx, proxyConfig}: {
    ctx: Context,
    proxyConfig: ProxyConfig,
  }): HTTP {
    switch (proxyConfig.proxyType) {
      case "NONE": {
        return ctx.http.extend({
          timeout: proxyConfig.timeout,
          ...{proxyAgent: undefined}
        });
      }
      case "MANUAL": {
        return ctx.http.extend({
          timeout: proxyConfig.timeout,
          ...{proxyAgent: proxyConfig.proxyAgent}
        });
      }
      case "GLOBAL":
      default: {
        return ctx.http;
      }
    }
  }

  function getCmdHttpClient({ctx, config, source}: {
    ctx: Context,
    config: Config,
    source: RandomSource,
  }): HTTP {
    if (!cmdHttpClient) {
      const proxyConfig: ProxyConfig = (config.expertMode && config.expert) ? config.expert : {proxyType: 'GLOBAL'};
      cmdHttpClient = buildHttpClient({ctx, proxyConfig})
    }

    if (!source.expertMode || Strings.isBlank(source.expert?.proxyAgent)) {
      return cmdHttpClient;
    }

    return cmdHttpClient.extend({
      ...{proxyAgent: source.expert.proxyAgent} as any
    });
  }

  function getPlatformHttpClient({ctx, config, session}: {
    ctx: Context,
    config: Config,
    session: Session,
  }): HTTP {
    if (!config.expertMode) {
      return ctx.http;
    }
    if (!platformHttpClientPool[session.platform]) {
      const platformResourceProxy = config.expert?.platformResourceProxyList
        ?.find(platformResourceProxy => platformResourceProxy.name === session.platform);
      platformHttpClientPool[session.platform] =
        !platformResourceProxy ? ctx.http
          : buildHttpClient({ctx, proxyConfig: platformResourceProxy});
    }
    return platformHttpClientPool[session.platform];
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
      let exist = false;
      await KoishiUtil.forList(
        (member) => {
          const nick = member.nick ?? member.user?.nick;
          const name = member.name ?? member.user?.name;
          if (u !== member.user?.id && u !== nick && u !== name) {
            return;
          }
          exist = true;
          const val = {
            ...member,
            user: {...member.user},
            nick,
            name,
          }
          val.toString = () => val.user.id + ':' + (val.nick ?? val.name)
          optionInfo.value = val;
          return false;
        },
        argv.session.bot, argv.session.bot.getGuildMemberList,
        argv.session.guildId
      );
      if (!exist) {
        optionInfo.value = {
          name: u
        };
        optionInfo.value.toString = () => ":" + u;
      }
    } else if (option.type === 'channel') {
      const c = value.split(':')[1];
      if (Strings.isBlank(c)) {
        return;
      }
      let exist = false;
      await KoishiUtil.forList(
        (channel) => {
          if (c !== channel.id && c !== channel.name) {
            return;
          }
          exist = true;
          const val = {...channel};
          val.toString = () => val.id + ':' + val.name;
          optionInfo.value = val;
          return false;
        },
        argv.session.bot, argv.session.bot.getChannelList,
        argv.session.guildId
      );
      if (!exist) {
        optionInfo.value = {
          name: c
        };
        optionInfo.value.toString = () => ":" + c;
      }
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

  async function handleOptionInfos({source, argv}: { source: RandomSource, argv: Argv }): Promise<OptionInfoMap> {
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

  async function formatOption({content, optionInfoMap, session}: {
    content: string,
    optionInfoMap: OptionInfoMap,
    session: Session,
  }): Promise<string> {
    const contentList = [];
    content = content
      .replace(/<%=([\s\S]+?)%>/g, function (match: string, p1: string) {
        contentList.push(p1);
        return match;
      });
    if (contentList.length < 1) {
      return content;
    }

    const resMap = {};
    for (let i = 0; i < contentList.length; i++) {
      const item = contentList[i];
      resMap[i + '_' + item] = await AsyncFunction(
        '$e', presetConstantPoolFnArg, presetFnPoolFnArg, optionInfoMap.fnArg, 'return ' + item.replace(/\n/g, '\\n')
      )(
        session.event, presetConstantPool ?? {}, presetFnPool ?? {}, optionInfoMap.map ?? {}
      );
    }

    let i = 0;
    content = content.replace(/<%=([\s\S]+?)%>/g, function (match: string, p1: string) {
      return resMap[i++ + '_' + p1] ?? '';
    })

    return content;
  }

  async function formatObjOption({obj, optionInfoMap, session, compelString}: {
    obj: {},
    optionInfoMap: OptionInfoMap,
    session: Session,
    compelString: boolean
  }) {
    await Objects.thoroughForEach(obj, async (value, key, obj) => {
      if (typeof value === 'string') {
        obj[key] = await formatOption({content: obj[key], optionInfoMap, session});
      }
    });

    for (let name in optionInfoMap.infoMap) {
      const optionInfo = optionInfoMap.infoMap[name];
      const oKey = optionInfo.overwriteKey || name;
      if (
        !optionInfo.autoOverwrite
        || typeof optionInfo.value === 'undefined'
        || typeof obj[oKey] === 'undefined'
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

  async function handleReqExpert({ctx, config, source, requestConfig, optionInfoMap, session, workData}: {
    ctx: Context,
    config: Config,
    source: RandomSource,
    requestConfig: HTTP.RequestConfig,
    optionInfoMap: OptionInfoMap,
    session: Session,
    workData: WorkData
  }) {
    let expert = source.expert;
    if (!source.expertMode || !expert) {
      return;
    }

    requestConfig.headers = {...(expert.requestHeaders || {})};
    await formatObjOption({obj: requestConfig.headers, optionInfoMap, session, compelString: true});

    switch (expert.requestDataType) {
      case "raw": {
        if (Strings.isBlank(expert.requestRaw)) {
          break;
        }
        // if (!requestConfig.headers['Content-Type'] && !expert.requestJson) {
        //   requestConfig.headers['Content-Type'] = 'text/plain';
        // }
        if (expert.requestJson) {
          requestConfig.data = JSON.parse(expert.requestRaw);
          await formatObjOption({obj: requestConfig.data, optionInfoMap, session, compelString: false});
        } else {
          requestConfig.data = await formatOption({
            content: expert.requestRaw.replace(/\\n/g, '\n'),
            optionInfoMap,
            session
          });
        }
        break;
      }
      case "x-www-form-urlencoded": {
        if (Objects.isEmpty(expert.requestForm)) {
          break;
        }
        // requestConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        requestConfig.data = new URLSearchParams(await formatObjOption({
          obj: JSON.parse(JSON.stringify(expert.requestForm)),
          optionInfoMap, session, compelString: true
        }));
        break;
      }
      case "form-data": {
        if (Objects.isEmpty(expert.requestForm) && Objects.isEmpty(expert.requestFormFiles)) {
          break;
        }
        // requestConfig.headers['Content-Type'] = 'multipart/form-data';

        const form = new FormData();
        requestConfig.data = form;
        const data = await formatObjOption({
          obj: JSON.parse(JSON.stringify(expert.requestForm || "{}")),
          optionInfoMap, session, compelString: true
        });
        for (let key in data) {
          form.append(key, data[key]);
        }

        const fileOverwriteKeys = [];
        for (let key in optionInfoMap.infoMap) {
          const optionInfo = optionInfoMap.infoMap[key];
          const oKey = optionInfo.overwriteKey || key;
          if (
            !optionInfo.autoOverwrite
            || !optionInfo.isFileUrl
            || Strings.isBlank(optionInfo.value + '')
            || typeof expert.requestFormFiles[oKey] === 'undefined'
          ) {
            continue;
          }

          const platformHttpClient = getPlatformHttpClient({ctx, config, session});
          const fileRes = await platformHttpClient('get', optionInfo.value + '', {
            responseType: "blob",
          });

          form.append(oKey, fileRes.data, optionInfo.fileName || await Files.getFileNameByBlob(fileRes.data));
          fileOverwriteKeys.push(oKey);
        }

        for (let key in expert.requestFormFiles) {
          if (fileOverwriteKeys.includes(key)) {
            continue;
          }
          const item = expert.requestFormFiles[key];
          const filePath = path.join(ctx.baseDir, item);
          const fileBlob = new Blob([fs.readFileSync(filePath)]);
          form.append(key, fileBlob, path.parse(filePath).base);
        }
        break;
      }
    }
  }

  async function cmdReq({ctx, config, source, argv, workData}: {
    ctx: Context,
    config: Config,
    source: RandomSource,
    argv: Argv,
    workData: WorkData,
  }) {
    const optionInfoMap = await handleOptionInfos({source, argv});

    const requestConfig: HTTP.RequestConfig = {};
    await handleReqExpert({ctx, config, source, requestConfig, optionInfoMap, session: argv.session, workData});
    const httpClient = getCmdHttpClient({ctx, config, source});
    return await httpClient(
      source.requestMethod,
      await formatOption({content: source.sourceUrl, optionInfoMap, session: argv.session}),
      requestConfig
    );
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
        presetConstantPool[presetConstant.name] = presetConstant.value;
        return;
      }
      const filePath = path.join(ctx.baseDir, presetConstant.value + '');
      Object.defineProperty(presetConstantPool, presetConstant.name, {
        configurable: true,
        enumerable: true,
        get: () => fs.readFileSync(filePath),
      })
    });
    presetConstantPoolFnArg = '{' + Object.keys(presetConstantPool).join(',') + '}={}';
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
          '{crypto,OTPAuth,http}', presetConstantPoolFnArg, presetFn.args, presetFn.body
        );
      presetFnPool[presetFn.name] = fn.bind(fn, {crypto, OTPAuth, http: ctx.http}, presetConstantPool ?? {});
    });
    presetFnPoolFnArg = '{' + Object.keys(presetFnPool).join(',') + '}={}';
  }

  function initCmdReq({ctx, config}: {
    ctx: Context,
    config: Config
  }) {
    initPresetConstants({ctx, config});
    initPresetFns({ctx, config});
  }

  function disposeCmdReq() {
    cmdHttpClient = null;
    for (let k in platformHttpClientPool) {
      delete platformHttpClientPool[k];
    }

    for (let k in presetConstantPool) {
      delete presetConstantPool[k];
    }
    presetConstantPoolFnArg = '{}={}';

    for (let k in presetFnPool) {
      delete presetFnPool[k];
    }
    presetFnPoolFnArg = '{}={}';
  }

  return {
    cmdReq,
    initCmdReq,
    disposeCmdReq
  }
}
