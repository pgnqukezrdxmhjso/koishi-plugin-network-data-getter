import path from "node:path";

import { Argv, Command, Context, HTTP } from "koishi";
// noinspection ES6UnusedImports
import {} from "@koishijs/plugin-console";

import Strings from "./utils/Strings";
import { Config } from "./Config";
import { logger } from "./logger";
import Umami from "./Umami";
import Core from "./Core";

export const inject = ["http"];
export { Config } from "./Config";
export const name = "network-data-getter";
// noinspection JSUnusedGlobalSymbols
export const reusable = true;
// noinspection JSUnusedGlobalSymbols
export const usage = `用法請詳閲 <a target="_blank" href="https://github.com/pgnqukezrdxmhjso/koishi-plugin-network-data-getter#koishi-plugin-network-data-getter">readme.md</a>`;

let applyCount = 0;

export function apply(ctx: Context, config: Config) {
  applyCount++;
  Umami.send({
    ctx,
    url: "plugin_ready",
    urlSearchParams: {
      uid: ctx.scope.uid,
    },
  });

  if (applyCount === 1) {
    ctx.inject(["console"], (ctx) => {
      const basePath = path.join(path.parse(__filename).dir, "../");
      ctx.console.addEntry({
        dev: path.join(basePath, "/client/index.ts"),
        prod: path.join(basePath, "/dist"),
      });
    });
  }

  const { initConfig, onDispose, send } = Core();
  initConfig({ ctx, config });
  ctx.on("dispose", () => {
    applyCount--;
    if (applyCount < 0) {
      applyCount = 0;
    }
    onDispose();
  });

  const allCmd: Set<string> = new Set();
  config.sources?.forEach((source) => {
    allCmd.add(source.command);
    source.alias?.forEach((alias) => {
      allCmd.add(alias);
    });
  });

  ctx.on(
    "message",
    (session) => {
      if (!session.quote) {
        return;
      }
      const elements = [...session.elements];
      const firstTextIndex = elements.findIndex((ele) => ele.type === "text");
      if (firstTextIndex > 0) {
        elements.splice(0, firstTextIndex);
      }
      let cmd: string = elements[0].attrs["content"]?.trim() + "";
      session.app.config.prefix?.forEach((p: string) => {
        cmd = cmd.replace(new RegExp("^" + p), "").trim();
      });
      const prefix = cmd.split(/\s/)[0];
      if (!allCmd.has(prefix)) {
        return;
      }
      elements.push(...session.quote.elements);
      delete session.event.message.quote;
      const lastIndex = elements.length - 1;
      elements.forEach((element, index) => {
        if (element.type !== "text") {
          return;
        }
        let content = (element.attrs?.content + "").trim();
        if (index < lastIndex) {
          content = content + " ";
        }
        if (index !== 0 && elements[index - 1].type !== "text") {
          content = " " + content;
        }
        element.attrs.content = content;
      });
      session.elements.length = 0;
      session.elements.push(...elements);
      session.event.message.content = session.elements.join("");
    },
    true,
  );

  config.sources.forEach((source) => {
    let def = source.command;
    if (source.expertMode)
      source.expert?.commandArgs?.forEach((arg) => {
        def +=
          " " +
          (arg.required ? "<" : "[") +
          arg.name +
          ":" +
          arg.type +
          (arg.required ? ">" : "]") +
          (Strings.isNotBlank(arg.desc) ? " " + arg.desc : "");
      });

    const command = ctx
      .command(def, source.desc ?? "", cmdConfig)
      .alias(...source.alias)
      .action((argv) => send({ ctx, config, source, argv }));

    if (source.expertMode)
      source.expert?.commandOptions?.forEach((option) => {
        const desc = [];
        const existValue = typeof option.value !== "undefined";
        if (option.acronym) {
          desc.push((option.acronym.length < 2 ? "" : "-") + `-${option.acronym}`);
        }
        if (!existValue && option.type !== "boolean") {
          desc.push(`[${option.name}:${option.type}]`);
        }
        if (Strings.isNotBlank(option.desc)) {
          desc.push(option.desc);
        }
        const config: Argv.OptionConfig = {};
        if (existValue) {
          config.value = option.value;
        }
        command.option(option.name, desc.join(" "), config);
      });
  });
}

const cmdConfig: Command.Config = {
  checkUnknown: true,
  checkArgCount: true,
  handleError: (err, { command }) => {
    if (HTTP.Error.is(err)) {
      logger.error(err.code, err.stack);
    } else {
      logger.error(err);
    }
    return `執行指令 ${command.displayName} 失敗`;
  },
};
