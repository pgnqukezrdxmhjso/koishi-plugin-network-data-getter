import {Command, Context} from 'koishi'
import {Config} from './config'
import {clearRecalls} from './send'
import {logger} from './logger'
import {send} from "./core";

export {Config} from './config'
export const name = 'network-data-getter'
export const usage = `用法請詳閲 <a target="_blank" href="https://github.com/pgnqukezrdxmhjso/koishi-plugin-network-data-getter#koishi-plugin-network-data-getter">readme.md</a>`


export function apply(ctx: Context, config: Config) {
  config.sources.forEach(source => {
    ctx.command(`${source.command} [...args]`, '', cmdConfig)
      .option('data', '-D [data:text] 請求數據')
      .alias(...source.alias)
      .action(({session, options}, ...args) =>
        send({
          ctx, config, session, source, args, data: options.data
        })
      )
  })
  ctx.on('dispose', () => clearRecalls())
}


const cmdConfig: Command.Config = {
  checkArgCount: true,
  checkUnknown: true,
  handleError: (err, {session, command}) => {
    logger.error(err)
    session.send(`執行指令 ${command.displayName} 時出現錯誤: ${err.message ?? err}`)
  }
}
