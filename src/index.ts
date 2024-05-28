import {Argv, Command, Context} from 'koishi'
import {Config} from './config'
import {clearRecalls} from './send'
import {logger} from './logger'
import {initConfig, onDispose, send} from "./core";
import Strings from "./utils/Strings";
import axios from "axios";
import NodeHtmlParser from "node-html-parser";

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
    if (Strings.isNotEmpty(session.quote?.content)) {
      await session.execute(session.content + ' ' + session.quote.content, next);
      return;
    }
    let content = session.content.trim();
    if (content.startsWith('<quote ')) {
      const contentElement = NodeHtmlParser.parse(content, {voidTag: {closingSlash: true}});
      contentElement.querySelectorAll('*')?.forEach(ele => {
        ele.insertAdjacentHTML('beforebegin', ' ');
        ele.insertAdjacentHTML('afterend', ' ');
      });
      const quoteElement = contentElement.querySelector('quote');
      const authorElement = quoteElement.querySelector('author');
      if (authorElement !== null) {
        quoteElement.removeChild(authorElement);
      }
      const quoteContent = quoteElement.innerHTML;
      contentElement.removeChild(quoteElement);
      await session.execute((contentElement.innerHTML + ' ' + quoteContent).trim(), next);
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

}


const cmdConfig: Command.Config = {
  checkUnknown: true,
  checkArgCount: true,
  handleError: (err, {command}) => {
    if (axios.isAxiosError(err)) {
      logger.error(err.code, err.stack)
    } else {
      logger.error(err)
    }
    return `執行指令 ${command.displayName} 失敗`
  }
}
