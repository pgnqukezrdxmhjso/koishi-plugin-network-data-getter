import {Context, Fragment, Session} from "koishi";
import {RandomSource, SendType} from "./config";
import {getRandom} from "./utils";
import {render} from 'ejs'
import {logger} from "./logger";
import {ResData} from "./CmdResData";
import Strings from "./utils/Strings";

interface SendMechanic {
  canSend?: (s: string) => boolean
  toJsx: (resData: ResData, source: RandomSource) => (any | Fragment)
}

export default function () {
  const recalls = new Set<NodeJS.Timeout>()

  const sendMap: { [key in SendType]: SendMechanic } = {
    'text': {
      canSend: (s: string) => s.length > 0,
      toJsx: (resData: ResData) => resData.text
    },

    'image': {
      canSend: (s: string) => s.startsWith('http') || s.startsWith('data:image/'),
      toJsx: (resData: ResData) => <img url={resData.text} alt=''/>
    },

    'audio': {
      canSend: (s: string) => s.startsWith('http') || s.startsWith('data:audio/'),
      toJsx: (resData: ResData) => <audio url={resData.text}/>
    },

    'video': {
      canSend: (s: string) => s.startsWith('http') || s.startsWith('data:video/'),
      toJsx: (resData: ResData) => <video url={resData.text}/>
    },

    'file': {
      canSend: (s: string) => s.startsWith('http') || s.startsWith('data:'),
      toJsx: (resData: ResData) => <file url={resData.text}/>
    },

    'ejs': {
      toJsx: (resData: ResData, source: RandomSource) => {
        try {
          const data = resData.json;
          const {ejsTemplate} = source;
          if (ejsTemplate) {
            return render(ejsTemplate, {data})
          } else {
            return JSON.stringify(data)
          }
        } catch (err) {
          logger.error('Error while parsing ejs data and json:')
          logger.error(err)
          throw err
        }
      }
    }
  }


  async function sendSource(session: Session<never, never, Context>, source: RandomSource, resData: ResData) {
    try {
      const sendMechanic = sendMap[source.sendType]
      if (!sendMechanic) {
        await session.send(`不支持的发送类型: ${source.sendType}`)
        return
      }
      if (resData.texts) {
        const selected = getRandom(resData.texts.filter(s => sendMechanic.canSend(s)));
        if (Strings.isEmpty(selected)) {
          await session.send('没有符合条件的结果');
          return;
        }
        resData.text = selected;
      }

      const [msg] = await session.send(sendMechanic.toJsx(resData, source))
      if (source.recall > 0) {
        logger.debug(`设置${source.recall}分钟后撤回`)
        const timeout = setTimeout(() => session.bot.deleteMessage(session.channelId, msg), source.recall * 60000)
        recalls.add(timeout)
      }
    } catch (err) {
      logger.error(err)
      await session.send(`发送失败: ${err?.message ?? err}`)
    }
  }

  function clearRecalls() {
    recalls.forEach(timeout => clearTimeout(timeout))
    recalls.clear()
  }

  return {
    sendSource, clearRecalls
  }
}
