import {Command, Context, Argv} from 'koishi'
import {Config} from './config'
import {clearRecalls} from './send'
import {logger} from './logger'
import {send} from "./core";
import Strings from "./utils/Strings";

export {Config} from './config'
export const name = 'network-data-getter'
export const usage = `用法請詳閲 <a target="_blank" href="https://github.com/pgnqukezrdxmhjso/koishi-plugin-network-data-getter#koishi-plugin-network-data-getter">readme.md</a>`


export function apply(ctx: Context, config: Config) {
  config.sources.forEach(source => {
    let def = source.command;
    source.expertMode && source.expert?.commandArgs?.forEach(arg => {
      def += ' '
        + (arg.required ? '<' : '[')
        + arg.name
        + ':'
        + arg.type
        + (arg.required ? '>' : ']')
        + (Strings.isNotBlank(arg.desc) ? ' ' + arg.desc : '');
    });

    const command = ctx.command(def, source.desc, cmdConfig)
      .alias(...source.alias)
      .action((argv) =>
        send({ctx, config, source, argv})
      );

    source.expertMode && source.expert?.commandOptions?.forEach(option => {
      const desc = [];
      const existValue = typeof option.value !== 'undefined';
      if (option.acronym) {
        desc.push(`-${option.acronym}`)
      }
      if (!existValue && option.type !== 'boolean') {
        desc.push(`[${option.name}:${option.type}]`)
      }
      if (Strings.isNotBlank(option.desc)) {
        desc.push(option.desc)
      }
      const config: Argv.OptionConfig = {};
      if (existValue) {
        config.value = option.value;
      }
      command.option(option.name, desc.join(' '), config);
    });

  })
  ctx.on('dispose', () => clearRecalls())
}


const cmdConfig: Command.Config = {
  checkUnknown: true,
  checkArgCount: true,
  handleError: (err, {session, command}) => {
    logger.error(err)
    session.send(`執行指令 ${command.displayName} 時出現錯誤: ${err.message ?? err}`)
  }
}
