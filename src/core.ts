import axios, {AxiosResponse, AxiosRequestConfig} from "axios";
import {HttpsProxyAgent} from 'https-proxy-agent';
import {Context, Session} from "koishi";

import {Config, extractOptions, RandomSource} from "./config";
import {logger} from "./logger";
import Strings from "./utils/Strings";
import {format} from "./utils";
import {parseSource} from "./split";
import {sendSource} from "./send";

const httpsProxyAgentPool = {};
const getHttpsProxyAgent = (proxyAgent: string): HttpsProxyAgent<string> => {
  if (!httpsProxyAgentPool[proxyAgent]) {
    httpsProxyAgentPool[proxyAgent] = new HttpsProxyAgent(proxyAgent);
  }
  return httpsProxyAgentPool[proxyAgent];
}

const handleProxyAgent = (parameter: AxiosRequestConfig, proxyAgent: string): void => {
  if (!proxyAgent) {
    return;
  }
  if ((/^http:/).test(parameter.url)) {
    parameter.httpAgent = getHttpsProxyAgent(proxyAgent);
    return;
  }
  parameter.httpsAgent = getHttpsProxyAgent(proxyAgent);
}

function handleReq({ctx, config, source, args = [], data}: {
  ctx: Context,
  config: Config,
  source: RandomSource,
  args: string[],
  data: string
}) {
  const parameter: AxiosRequestConfig = {
    timeout: ctx.http?.config?.timeout,
    method: source.requestMethod,
    url: format(source.sourceUrl, ...args),
  };

  if (config.expertMode && config.expert) {
    switch (config.expert.proxyType) {
      case "NONE": {
        parameter.timeout = config.expert.timeout;
        break;
      }
      case "GLOBAL": {
        parameter.timeout = ctx.http?.config?.timeout;
        handleProxyAgent(parameter, ctx.http?.config?.['proxyAgent']);
        break;
      }
      case "MANUAL": {
        parameter.timeout = config.expert.timeout;
        handleProxyAgent(parameter, config.expert.proxyAgent);
        break;
      }
    }
  } else {
    parameter.timeout = ctx.http?.config?.timeout;
    handleProxyAgent(parameter, ctx.http?.config?.['proxyAgent']);
  }

  if (source.expertMode && source.expert) {
    if (Strings.isNotBlank(source.expert.proxyAgent)) {
      handleProxyAgent(parameter, source.expert.proxyAgent);
    }
    parameter.headers = source.expert.requestHeaders;
    const requestData = data || source.expert.requestData;
    parameter.data = source.expert.requestJson ? JSON.parse(requestData) : requestData;
  }

  return parameter;
}

export async function send({ctx, config, source, session, args = [], data}: {
  ctx: Context,
  config: Config,
  source: RandomSource,
  session: Session,
  args: string[],
  data?: string
}) {
  try {
    const options = extractOptions(source)
    logger.debug('options: ', options)
    logger.debug('args: ', args)
    logger.debug('data: ', data)
    if (config.gettingTips && source.gettingTips) {
      await session.send(`獲取 ${source.command} 中，請稍候...`)
    }
    const res: AxiosResponse = await axios(handleReq({
      ctx, config, source, args, data
    }));
    if (res.status > 300 || res.status < 200) {
      const msg = JSON.stringify(res.data)
      throw new Error(`${msg} (${res.statusText})`)
    }
    const elements = parseSource(res, source.dataType, options)
    await sendSource(session, source.sendType, elements, source.recall, options)

  } catch (err) {
    if (axios.isAxiosError(err)) {
      logger.error(err.code, err.stack)
      await session.send(`發送失敗: ${err.message}`)
    } else {
      logger.error(err)
      await session.send(`發送失敗: ${err?.message ?? err}`)
    }
  }
}
