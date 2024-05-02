import { Context, Session, Command, Logger } from 'koishi'
import { Config, RandomSource, extractOptions } from './config'
import axios, { AxiosResponse } from 'axios'
import { parseSource } from './split'
import { clearRecalls, sendSource } from './send'
import { format } from './utils'
import { logger } from './logger'

export { Config } from './config'
export const name = 'network-data-getter'
export const usage = `用法请详阅 readme.md`


export function apply(ctx: Context, config: Config) {
  // write your plugin here
  config.sources.forEach(source => {
    ctx.command(`${source.command} [...args]`, '随机抽出该链接中的一条作为图片或文案发送', cmdConfig)
      .option('data', '-D [data:text] 请求数据')
      .alias(...source.alias)
      .action(({ session, options }, ...args) => sendFromSource(session, source, args, options.data))
  })

  ctx.on('dispose', () => clearRecalls())
}

async function sendFromSource(session: Session<never, never, Context>, source: RandomSource, args: string[] = [], data?: string) {
  try {
    const options = extractOptions(source)
    logger.debug('options: ', options)
    logger.debug('args: ', args)
    logger.debug('data: ', data)
    await session.send(`获取 ${source.command} 中，请稍候...`)
    const requestData = data ?? source.request_data
    const res: AxiosResponse = await axios({
      method: source.request_method,
      url: format(source.source_url, ...args),
      headers: source.request_headers,
      data: source.request_json ? JSON.parse(requestData) : requestData
    })
    if (res.status > 300 || res.status < 200) {
      const msg = JSON.stringify(res.data)
      throw new Error(`${msg} (${res.statusText})`)
    }
    const elements = parseSource(res, source.data_type, options)
    await sendSource(session, source.send_type, elements, source.recall, options)

  } catch (err) {
    if (axios.isAxiosError(err)) {
      logger.error(err.code, err.stack)
      await session.send(`发送失败: ${err.message}`)
    } else {
      logger.error(err)
      await session.send(`发送失败: ${err?.message ?? err}`)
    }
  }
}

const cmdConfig: Command.Config = {
  checkArgCount: true,
  checkUnknown: true,
  handleError: (err, { session, command }) => {
    logger.error(err)
    session.send(`执行指令 ${command.displayName} 时出现错误: ${err.message ?? err}`)
  }
}
