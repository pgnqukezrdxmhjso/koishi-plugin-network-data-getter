import axios, {AxiosResponse, AxiosRequestConfig} from "axios";
import {HttpsProxyAgent} from 'https-proxy-agent';
import {Context, Session} from "koishi";

import {Config, extractOptions, RandomSource} from "./config";
import {logger} from "./logger";
import {format} from "./utils";
import {parseSource} from "./split";
import {sendSource} from "./send";

function handleReq({ctx, source, args = [], requestData}: {
  ctx: Context,
  source: RandomSource,
  args: string[],
  requestData: string
}) {
  const parameter: AxiosRequestConfig = {
    timeout: ctx.http?.config?.timeout,
    method: source.request_method,
    url: format(source.source_url, ...args),
    headers: source.request_headers,
    data: source.request_json ? JSON.parse(requestData) : requestData
  };

  if (ctx.http?.config?.['proxyAgent']) {
    parameter.httpsAgent = new HttpsProxyAgent(ctx.http.config['proxyAgent']);
  }
  return parameter;
}

export async function send(ctx: Context, config: Config, session: Session, source: RandomSource, args: string[] = [], data?: string) {
  try {
    const options = extractOptions(source)
    logger.debug('options: ', options)
    logger.debug('args: ', args)
    logger.debug('data: ', data)
    if (config.getting_tips && source.getting_tips) {
      await session.send(`獲取 ${source.command} 中，請稍候...`)
    }
    const requestData = data ?? source.request_data
    const res: AxiosResponse = await axios(handleReq({
      ctx, source, args, requestData
    }));
    if (res.status > 300 || res.status < 200) {
      const msg = JSON.stringify(res.data)
      throw new Error(`${msg} (${res.statusText})`)
    }
    const elements = parseSource(res, source.data_type, options)
    await sendSource(session, source.send_type, elements, source.recall, options)

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
