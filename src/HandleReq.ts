import {pipeline} from "node:stream/promises";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import {Channel, GuildMember} from "@satorijs/protocol/src";
import {Argv, Context, Element, Session} from "koishi";
import {HttpsProxyAgent} from "https-proxy-agent";
import axios, {AxiosRequestConfig} from "axios";
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

  const httpsProxyAgentPool: Record<string, HttpsProxyAgent<string>> = {};
  const presetConstantPool: Record<string, OptionValue> = {};
  let presetConstantPoolFnArg = '{}={}';

  const presetFnPool: Record<string, Function> = {};
  let presetFnPoolFnArg = '{}={}';

  function getHttpsProxyAgent(proxyAgent: string): HttpsProxyAgent<string> {
    if (!httpsProxyAgentPool[proxyAgent]) {
      httpsProxyAgentPool[proxyAgent] = new HttpsProxyAgent(proxyAgent);
    }
    return httpsProxyAgentPool[proxyAgent];
  }

  function handleProxyAgent(parameter: AxiosRequestConfig, proxyAgent: string) {
    if (Strings.isBlank(proxyAgent)) {
      return;
    }
    if ((/^http:/).test(parameter.url)) {
      parameter.httpAgent = getHttpsProxyAgent(proxyAgent);
      return;
    }
    parameter.httpsAgent = getHttpsProxyAgent(proxyAgent);
  }

  function handleProxyConfig({ctx, proxyConfig, parameter}: {
    ctx: Context,
    proxyConfig: ProxyConfig,
    parameter: AxiosRequestConfig,
  }) {
    switch (proxyConfig.proxyType) {
      case "NONE": {
        parameter.timeout = proxyConfig.timeout;
        break;
      }
      case "GLOBAL": {
        parameter.timeout = ctx.http?.config?.timeout;
        handleProxyAgent(parameter, ctx.http?.config?.['proxyAgent']);
        break;
      }
      case "MANUAL": {
        parameter.timeout = proxyConfig.timeout;
        handleProxyAgent(parameter, proxyConfig.proxyAgent);
        break;
      }
    }
  }

  function handleReqConfigProxyConfig({ctx, config, parameter}: {
    ctx: Context,
    config: Config,
    parameter: AxiosRequestConfig,
  }) {
    const expert = config.expert;
    if (!config.expertMode || !expert) {
      parameter.timeout = ctx.http?.config?.timeout;
      handleProxyAgent(parameter, ctx.http?.config?.['proxyAgent']);
      return;
    }
    handleProxyConfig({ctx, proxyConfig: expert, parameter});
  }

  function handleReqPlatformProxyConfig({ctx, config, session, parameter}: {
    ctx: Context,
    config: Config,
    session: Session,
    parameter: AxiosRequestConfig,
  }) {
    if (!config.expertMode) {
      return;
    }
    const platformResourceProxy = config.expert?.platformResourceProxyList
      ?.find(platformResourceProxy => platformResourceProxy.name === session.platform);
    if (!platformResourceProxy) {
      return;
    }
    handleProxyConfig({ctx, proxyConfig: platformResourceProxy, parameter})
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
          optionInfo.fileName = element.attrs[attrsKey];
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
      .replace(/\n/g, '\\n')
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
        '$e', presetConstantPoolFnArg, presetFnPoolFnArg, optionInfoMap.fnArg, 'return ' + item
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
        obj[key] = await formatOption({content: obj[key], optionInfoMap, session})
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
  }

  async function handleReqExpert({ctx, config, source, parameter, optionInfoMap, session, workData}: {
    ctx: Context,
    config: Config,
    source: RandomSource,
    parameter: AxiosRequestConfig,
    optionInfoMap: OptionInfoMap,
    session: Session,
    workData: WorkData
  }) {
    let expert = source.expert;
    if (!source.expertMode || !expert) {
      return;
    }

    if (Strings.isNotBlank(expert.proxyAgent)) {
      handleProxyAgent(parameter, expert.proxyAgent);
    }

    parameter.headers = expert.requestHeaders || {};
    await formatObjOption({obj: parameter.headers, optionInfoMap, session, compelString: false});

    switch (expert.requestDataType) {
      case "raw": {
        if (Strings.isBlank(expert.requestData)) {
          break;
        }
        if (!parameter.headers['Content-Type'] && !expert.requestJson) {
          parameter.headers['Content-Type'] = 'text/plain';
        }
        if (expert.requestJson) {
          parameter.data = JSON.parse(expert.requestData);
          await formatObjOption({obj: parameter.data, optionInfoMap, session, compelString: false});
        } else {
          parameter.data = expert.requestData;
        }
        break;
      }
      case "x-www-form-urlencoded": {
        if (Strings.isBlank(expert.requestData)) {
          break;
        }
        parameter.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        parameter.data = JSON.parse(expert.requestData);
        await formatObjOption({obj: parameter.data, optionInfoMap, session, compelString: true});
        break;
      }
      case "form-data": {
        if (Strings.isBlank(expert.requestData) && Object.keys(expert.requestFormFiles).length < 1) {
          break;
        }
        parameter.headers['Content-Type'] = 'multipart/form-data';
        parameter.data = JSON.parse(expert.requestData || "{}");
        await formatObjOption({obj: parameter.data, optionInfoMap, session, compelString: true});

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

          const fileParameter: AxiosRequestConfig = {
            url: optionInfo.value + '',
            responseType: "stream",
          }
          handleReqPlatformProxyConfig({ctx, config, session, parameter: fileParameter});

          const fileRes = await axios(fileParameter);
          let tmpFilePath = await Files.tmpFile();
          const writer = fs.createWriteStream(tmpFilePath);
          await pipeline(fileRes.data, writer);
          tmpFilePath = await Files.tmpFileMoveBeautifyName(tmpFilePath, optionInfo.fileName);
          workData.tempFiles.push(tmpFilePath);
          parameter.data[oKey] = fs.createReadStream(tmpFilePath);
          fileOverwriteKeys.push(oKey);
        }
        for (let key in expert.requestFormFiles) {
          if (fileOverwriteKeys.includes(key)) {
            continue;
          }
          const item = expert.requestFormFiles[key];
          parameter.data[key] = fs.createReadStream(path.join(ctx.baseDir, item));
        }
        break;
      }
    }
  }

  async function handleReq({ctx, config, source, argv, workData,}: {
    ctx: Context,
    config: Config,
    source: RandomSource,
    argv: Argv,
    workData: WorkData,
  }) {
    const optionInfoMap = await handleOptionInfos({source, argv});

    const parameter: AxiosRequestConfig = {
      url: await formatOption({content: source.sourceUrl, optionInfoMap, session: argv.session}),
      method: source.requestMethod,
    };
    handleReqConfigProxyConfig({ctx, config, parameter});
    await handleReqExpert({ctx, config, source, parameter, optionInfoMap, session: argv.session, workData});

    return parameter;
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

  function initHandleReq({ctx, config}: {
    ctx: Context,
    config: Config
  }) {
    initPresetConstants({ctx, config});
    initPresetFns({ctx, config});
  }

  function disposeHandleReq() {
    for (let k in httpsProxyAgentPool) {
      delete httpsProxyAgentPool[k];
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
    handleReq,
    initHandleReq,
    disposeHandleReq
  }
}
