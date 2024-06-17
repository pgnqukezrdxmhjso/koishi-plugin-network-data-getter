import fs from "node:fs";
import {Argv, Context, HTTP} from "koishi";
import {Config, RandomSource} from "./config";
import {logger} from "./logger";
import {parseSource} from "./split";
import Send from "./Send";
import CmdReq from "./CmdReq";
import {Writable, Readable} from "node:stream";


export interface WorkData {
  tempFiles: string[];
  streams: (Writable | Readable)[];
}

export default function () {
  const {cmdReq, initCmdReq, disposeCmdReq} = CmdReq();
  const {clearRecalls, sendSource} = Send();

  async function send({ctx, config, source, argv}: {
    ctx: Context,
    config: Config,
    source: RandomSource,
    argv: Argv,
  }) {
    logger.debug('args: ', argv.args);
    logger.debug('options: ', argv.options);

    const session = argv.session;
    if (config.gettingTips != source.reverseGettingTips) {
      await session.send(`獲取 ${source.command} 中，請稍候...`);
    }

    const workData: WorkData = {
      tempFiles: [],
      streams: []
    };

    try {

      const res: HTTP.Response = await cmdReq({
        ctx, config, source, argv, workData
      });
      if (res.status > 300 || res.status < 200) {
        const msg = JSON.stringify(res.data);
        throw new Error(`${msg} (${res.statusText})`);
      }

      const elements = parseSource(res, source);
      await sendSource(session, source, elements);

    } finally {
      workData.streams.forEach(stream => {
        !stream.closed && stream.destroy();
      })
      workData.tempFiles.forEach(file => {
        fs.rm(file, () => {
        });
      });
    }
  }

  function initConfig({ctx, config}: {
    ctx: Context,
    config: Config
  }) {
    initCmdReq({ctx, config});
  }

  function onDispose() {
    clearRecalls();
    disposeCmdReq();
  }

  return {send, initConfig, onDispose};

}
