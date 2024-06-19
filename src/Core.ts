import {Argv, Context, HTTP} from "koishi";
import {Config, CmdSource} from "./config";
import {logger} from "./logger";
import {cmdResData} from "./CmdResData";
import Send from "./Send";
import CmdReq from "./CmdReq";

export default function () {
  const {cmdReq, initCmdReq, disposeCmdReq} = CmdReq();
  const {clearRecalls, sendSource} = Send();

  async function send({ctx, config, source, argv}: {
    ctx: Context,
    config: Config,
    source: CmdSource,
    argv: Argv,
  }) {
    logger.debug('args: ', argv.args);
    logger.debug('options: ', argv.options);

    const session = argv.session;
    if (config.gettingTips != source.reverseGettingTips) {
      await session.send(`獲取 ${source.command} 中，請稍候...`);
    }

    const res: HTTP.Response = await cmdReq({
      ctx, config, source, argv
    });
    if (res.status > 300 || res.status < 200) {
      const msg = JSON.stringify(res.data);
      throw new Error(`${msg} (${res.statusText})`);
    }

    const resData = cmdResData(res, source);
    await sendSource(session, source, resData);
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
