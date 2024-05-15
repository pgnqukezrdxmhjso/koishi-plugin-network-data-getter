import axios, {AxiosResponse, AxiosRequestConfig} from "axios";
import {HttpsProxyAgent} from 'https-proxy-agent';
import {Context, Session} from "koishi";

import {Config, extractOptions, RandomSource} from "./config";
import {logger} from "./logger";
import {format} from "./utils";
import {parseSource} from "./split";
import {sendSource} from "./send";

const httpsProxyAgentPool = {}
const getHttpsProxyAgent = (proxyAgent: string): HttpsProxyAgent<string> => {
  if (!httpsProxyAgentPool[proxyAgent]) {
    httpsProxyAgentPool[proxyAgent] = new HttpsProxyAgent(proxyAgent);
  }
  return httpsProxyAgentPool[proxyAgent]
}

const handleProxyAgent = (parameter: AxiosRequestConfig, proxyAgent: string) => {
  if (!proxyAgent) {
    return;
  }
  parameter.httpsAgent = getHttpsProxyAgent(proxyAgent);
}

function handleReq({ctx, config, source, args = [], requestData}: {
  ctx: Context,
  config: Config,
  source: RandomSource,
  args: string[],
  requestData: string
}) {
  const parameter: AxiosRequestConfig = {
    timeout: ctx.http?.config?.timeout,
    method: source.requestMethod,
    url: format(source.sourceUrl, ...args),
    headers: source.requestHeaders,
    data: source.requestJson ? JSON.parse(requestData) : requestData
  };

  switch (config.proxyType) {
    case "NONE": {
      parameter.timeout = config.timeout;
      break;
    }
    case "GLOBAL": {
      parameter.timeout = ctx.http?.config?.timeout;
      handleProxyAgent(parameter, ctx.http?.config?.['proxyAgent']);
      break;
    }
    case "MANUAL": {
      parameter.timeout = config.timeout;
      handleProxyAgent(parameter, config.proxyAgent);
      break;
    }
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
    const requestData = data ?? source.requestData
    const res: AxiosResponse = await axios(handleReq({
      ctx, config, source, args, requestData
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
