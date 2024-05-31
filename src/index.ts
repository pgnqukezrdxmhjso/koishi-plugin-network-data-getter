import {Argv, Command, Context, Element} from 'koishi';
import axios from "axios";
import {Config} from './config';
import {clearRecalls} from './send';
import {logger} from './logger';
import {initConfig, onDispose, send} from "./core";
import Strings from "./utils/Strings";
import Arrays from "./utils/Arrays";

export {Config} from './config'
export const name = 'network-data-getter'
// noinspection JSUnusedGlobalSymbols
export const usage = `用法請詳閲 <a target="_blank" href="https://github.com/pgnqukezrdxmhjso/koishi-plugin-network-data-getter#koishi-plugin-network-data-getter">readme.md</a>`


export function apply(ctx: Context, config: Config) {
  initConfig({ctx, config});
  ctx.on('dispose', () => {
    onDispose();
    clearRecalls();
  });

  ctx.middleware(async (session, next) => {
    if (Arrays.isEmpty(config.sources)) {
      return next();
    }
    let cmd: string;
    if (Strings.isNotEmpty(session.quote?.content)) {
      const firstTextIndex = session.elements.findIndex(ele => ele.type === 'text');
      cmd = session.elements.slice(firstTextIndex, session.elements.length).join(' ') + ' ' + session.quote.elements.join(' ');
    } else if (session.content.trim().startsWith('<quote ')) {
      const elements = Element.parse(session.content);
      const quoteElement = elements.shift();
      elements.push(...quoteElement.children?.filter(ele => ele.type !== 'author'));
      cmd = elements.join(' ');
    }
    if (!cmd) {
      return next();
    }
    cmd = cmd.trim();
    session.app.config.prefix?.forEach((p: string) => {
      cmd = cmd.replace(new RegExp('^' + p), '').trim();
    })
    const prefix = cmd.split(/\s/)[0];
    if (config.sources.find(source => source.command === prefix || source.alias?.includes(prefix))) {
      await session.execute(cmd, next);
      return;
    }
    return next();
  }, true);

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

    const command =
      ctx.command(def, source.desc ?? '', cmdConfig)
        .alias(...source.alias)
        .action((argv) =>
          send({ctx, config, source, argv})
        );

    source.expertMode && source.expert?.commandOptions?.forEach(option => {
      const desc = [];
      const existValue = typeof option.value !== 'undefined';
      if (option.acronym) {
        desc.push(`-${option.acronym}`);
      }
      if (!existValue && option.type !== 'boolean') {
        desc.push(`[${option.name}:${option.type}]`);
      }
      if (Strings.isNotBlank(option.desc)) {
        desc.push(option.desc);
      }
      const config: Argv.OptionConfig = {};
      if (existValue) {
        config.value = option.value;
      }
      command.option(option.name, desc.join(' '), config);
    });
  });

}

const cmdConfig: Command.Config = {
  checkUnknown: true,
  checkArgCount: true,
  handleError: (err, {command}) => {
    if (axios.isAxiosError(err)) {
      logger.error(err.code, err.stack);
    } else {
      logger.error(err);
    }
    return `執行指令 ${command.displayName} 失敗`;
  }
}
