import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {Argv, Context, Session} from "koishi";
import axios, {AxiosRequestConfig, AxiosResponse} from "axios";
import {HttpsProxyAgent} from 'https-proxy-agent';
import NodeHtmlParser from 'node-html-parser';
import * as OTPAuth from "otpauth";
import {Config, extractOptions, ProxyConfig, RandomSource} from "./config";
import {logger} from "./logger";
import Strings from "./utils/Strings";
import {parseSource} from "./split";
import {sendSource} from "./send";
import Objects from "./utils/Objects";
import Arrays from "./utils/Arrays";

type OptionInfo = {
  value: boolean | string | number,
  fileName?: string,
  isFileUrl?: boolean,
  autoOverwrite: boolean,
  overwriteKey?: string
}

type OptionInfoMap = {
  infoMap: Record<string, OptionInfo>,
  map: Record<string, boolean | string | number>,
  fnArg: string
}

type WorkData = {
  tempFiles: string[];
}

const httpsProxyAgentPool = {};

const presetConstantPool = {};
let presetConstantPoolFnArg = '{}={}';

const presetFnPool = {};
let presetFnPoolFnArg = '{}={}';

const getHttpsProxyAgent = (proxyAgent: string): HttpsProxyAgent<string> => {
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

function handleOptionInfos({source, argv}: { source: RandomSource, argv: Argv }): OptionInfoMap {
  const map = {};
  const infoMap: Record<string, OptionInfo> = {};
  const fnArgs = [];
  const expert = source.expert;
  if (source.expertMode && expert) {
    expert.commandOptions?.forEach(option => {
      const value = argv.options?.[option.name];
      map[option.name] = value;
      infoMap[option.name] = {
        value,
        autoOverwrite: option.autoOverwrite,
        overwriteKey: option.overwriteKey,
      };
    });

    expert.commandArgs?.forEach((arg, i) => {
      const value = argv.args?.[i];
      map[arg.name] = value;
      infoMap[arg.name] = {
        value,
        autoOverwrite: arg.autoOverwrite,
        overwriteKey: arg.overwriteKey,
      };
      map['$' + i] = value;
      infoMap['$' + i] = infoMap[arg.name];
    });
  }

  for (const key in infoMap) {
    fnArgs.push(key);
    const optionInfo = infoMap[key];
    const value = optionInfo.value;
    if (
      typeof value !== 'string'
      || !(/^<(img|audio|video|file)/).test(value.trim())
      || (/&lt;(img|audio|video|file)/).test(argv.source)
    ) {
      continue;
    }
    const htmlElement = NodeHtmlParser.parse(value).querySelector("img,audio,video,file");
    const imgSrc = htmlElement.getAttribute('src');
    if (Strings.isNotBlank(imgSrc)) {
      map[key] = imgSrc;
      optionInfo.value = imgSrc;
      optionInfo.isFileUrl = true;
      optionInfo.fileName = htmlElement.getAttribute('file');
    }
  }
  return {infoMap, map, fnArg: '{' + fnArgs.join(',') + '}={}'};
}

function formatOption({content, optionInfoMap, session}: {
  content: string,
  optionInfoMap: OptionInfoMap,
  session: Session,
}): string {
  return content
    .replace(/\n/g, '\\n')
    .replace(/<%=([\s\S]+?)%>/g, function (match: string, p1: string) {
      const value =
        Function(
          '$e', presetConstantPoolFnArg, presetFnPoolFnArg, optionInfoMap.fnArg, 'return ' + p1
        )(
          session.event, presetConstantPool ?? {}, presetFnPool ?? {}, optionInfoMap.map ?? {}
        );
      return value ?? '';
    });
}

function formatObjOption({obj, optionInfoMap, session, compelString}: {
  obj: {},
  optionInfoMap: OptionInfoMap,
  session: Session,
  compelString: boolean
}) {
  Objects.thoroughForEach(obj, (value, key, obj) => {
    if (typeof value === 'string') {
      obj[key] = formatOption({content: obj[key], optionInfoMap, session})
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
  formatObjOption({obj: parameter.headers, optionInfoMap, session, compelString: false});

  switch (expert.requestDataType) {
    case "raw": {
      const requestData = expert.requestData;
      if (Strings.isBlank(requestData)) {
        break;
      }
      if (!parameter.headers['Content-Type'] && !expert.requestJson) {
        parameter.headers['Content-Type'] = 'text/plain';
      }
      if (!expert.requestJson) {
        parameter.data = requestData;
      } else {
        parameter.data = JSON.parse(requestData);
        formatObjOption({obj: parameter.data, optionInfoMap, session, compelString: false});
      }
      break;
    }
    case "form-data": {
      if (Strings.isBlank(expert.requestData) && Object.keys(expert.requestFormFiles).length < 1) {
        break;
      }
      parameter.headers['Content-Type'] = 'multipart/form-data';
      parameter.data = JSON.parse(expert.requestData || "{}");
      formatObjOption({obj: parameter.data, optionInfoMap, session, compelString: true});

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
          responseType: "arraybuffer",
        }
        handleReqPlatformProxyConfig({ctx, config, session, parameter: fileParameter})
        const fileRes = await axios(fileParameter);
        const tempFilePath = path.join(os.tmpdir(),
          Strings.isNotBlank(optionInfo.fileName) ? optionInfo.fileName : crypto.createHash('md5').update(fileRes.data).digest('hex'),
        );
        await fs.promises.writeFile(tempFilePath, fileRes.data);
        workData.tempFiles.push(tempFilePath);
        parameter.data[oKey] = fs.createReadStream(tempFilePath);
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
    case "x-www-form-urlencoded": {
      if (Strings.isBlank(expert.requestData)) {
        break;
      }
      parameter.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      parameter.data = JSON.parse(expert.requestData);
      formatObjOption({obj: parameter.data, optionInfoMap, session, compelString: true});
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
  const optionInfoMap = handleOptionInfos({source, argv});

  const parameter: AxiosRequestConfig = {
    url: formatOption({content: source.sourceUrl, optionInfoMap, session: argv.session}),
    method: source.requestMethod,
  };
  handleReqConfigProxyConfig({ctx, config, parameter});
  await handleReqExpert({ctx, config, source, parameter, optionInfoMap, session: argv.session, workData});

  return parameter;
}


export async function send({ctx, config, source, argv}: {
  ctx: Context,
  config: Config,
  source: RandomSource,
  argv: Argv,
}) {
  logger.debug('args: ', argv.args);
  logger.debug('options: ', argv.options);

  const session = argv.session;
  if (config.gettingTips != source.reverseGettingTips) {
    await session.send(`獲取 ${source.command} 中，請稍候...`);
  }

  const workData: WorkData = {
    tempFiles: []
  };

  try {
    const res: AxiosResponse = await axios(await handleReq({
      ctx, config, source, argv, workData
    }));
    if (res.status > 300 || res.status < 200) {
      const msg = JSON.stringify(res.data);
      throw new Error(`${msg} (${res.statusText})`);
    }

    const options = extractOptions(source);
    logger.debug('options: ', options);
    const elements = parseSource(res, source.dataType, options);
    await sendSource(session, source.sendType, elements, source.recall, options);

  } finally {
    workData.tempFiles.forEach(file => {
      fs.rm(file, () => {
      });
    });
  }
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

function initPresetFns({config}: { config: Config }) {
  if (!config.expertMode || !config.expert || Arrays.isEmpty(config.expert.presetFns)) {
    return;
  }
  config.expert.presetFns.forEach(presetFn => {
    if (!presetFn) {
      return
    }
    const fn =
      Function(
        '{crypto,OTPAuth}', presetConstantPoolFnArg, presetFn.args, presetFn.body
      );
    presetFnPool[presetFn.name] = fn.bind(fn, {crypto, OTPAuth}, presetConstantPool ?? {});
  });
  presetFnPoolFnArg = '{' + Object.keys(presetFnPool).join(',') + '}={}';
}

export function initConfig({ctx, config}: {
  ctx: Context,
  config: Config
}) {
  initPresetConstants({ctx, config});
  initPresetFns({config});
}

export function onDispose() {
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
