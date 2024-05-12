import {Context, Session, Command, Logger} from 'koishi'
import {Config, RandomSource, extractOptions} from './config'
import axios, {AxiosResponse} from 'axios'
import {parseSource} from './split'
import {clearRecalls, sendSource} from './send'
import {format} from './utils'
import {logger} from './logger'

export {Config} from './config'
export const name = 'network-data-getter'
export const usage = `用法請詳閲 <a target="_blank" href="https://github.com/pgnqukezrdxmhjso/koishi-plugin-network-data-getter#koishi-plugin-network-data-getter">readme.md</a>`


export function apply(ctx: Context, config: Config) {
  // write your plugin here
  config.sources.forEach(source => {
    ctx.command(`${source.command} [...args]`, '隨機抽出該鏈接中的一條作為圖片或文案發送', cmdConfig)
      .option('data', '-D [data:text] 請求數據')
      .alias(...source.alias)
      .action(({session, options}, ...args) => sendFromSource(config, session, source, args, options.data))
  })

  ctx.on('dispose', () => clearRecalls())
}

async function sendFromSource(config: Config, session: Session<never, never, Context>, source: RandomSource, args: string[] = [], data?: string) {
  try {
    const options = extractOptions(source)
    logger.debug('options: ', options)
    logger.debug('args: ', args)
    logger.debug('data: ', data)
    if (config.getting_tips && source.getting_tips) {
      await session.send(`獲取 ${source.command} 中，請稍候...`)
    }
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
      await session.send(`發送失敗: ${err.message}`)
    } else {
      logger.error(err)
      await session.send(`發送失敗: ${err?.message ?? err}`)
    }
  }
}

const cmdConfig: Command.Config = {
  checkArgCount: true,
  checkUnknown: true,
  handleError: (err, {session, command}) => {
    logger.error(err)
    session.send(`執行指令 ${command.displayName} 時出現錯誤: ${err.message ?? err}`)
  }
}
