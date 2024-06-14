import fs from "node:fs";
import {Argv, Context} from "koishi";
import axios, {AxiosResponse} from "axios";
import {Config, RandomSource} from "./config";
import {logger} from "./logger";
import {parseSource} from "./split";
import Send from "./Send";
import HandleReq from "./HandleReq";


export interface WorkData {
  tempFiles: string[];
}

export default function () {
  const {handleReq, initHandleReq, disposeHandleReq} = HandleReq();
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
      tempFiles: []
    };

    try {
      const res: AxiosResponse = await axios(await handleReq({
        ctx, config, source, argv, workData
      }));
      if (res.status > 300 || res.status < 200) {
        const msg = JSON.stringify(res.data);
        throw new Error(`${msg} (${res.statusText})`);
      }

      const elements = parseSource(res,  source);
      await sendSource(session, source, elements);

    } finally {
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
    initHandleReq({ctx, config});
  }

  function onDispose() {
    clearRecalls();
    disposeHandleReq();
  }

  return {send, initConfig, onDispose};

}
