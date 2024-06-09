import {Context, Fragment, Session} from "koishi";
import {RandomSource, SendType} from "./config";
import {getRandom} from "./utils";
import {render} from 'ejs'
import {logger} from "./logger";

interface SendMechanic {
  canSend: (s: string, source: RandomSource) => boolean
  toJsx: (s: string, source: RandomSource) => (any | Fragment)
}

export default function () {
  const recalls = new Set<NodeJS.Timeout>()

  const sendMap: { [key in SendType]: SendMechanic } = {
    'text': {
      canSend: (s: string) => s.length > 0,
      toJsx: (s: string) => s
    },

    'image': {
      canSend: (s: string) => s.startsWith('http') || s.startsWith('data:image/'),
      toJsx: (s: string) => <img url={s} alt=''/>
    },

    'audio': {
      canSend: (s: string) => s.startsWith('http') || s.startsWith('data:audio/'),
      toJsx: (s: string) => <audio url={s}/>
    },

    'video': {
      canSend: (s: string) => s.startsWith('http') || s.startsWith('data:video/'),
      toJsx: (s: string) => <video url={s}/>
    },

    'file': {
      canSend: (s: string) => s.startsWith('http') || s.startsWith('data:'),
      toJsx: (s: string) => <file url={s}/>
    },

    'ejs': {
      canSend: (s: string) => true,
      toJsx: (s: string, source: RandomSource) => {
        try {
          const data = JSON.parse(s)
          const {ejsTemplate} = source;
          if (ejsTemplate) {
            return render(ejsTemplate, {data})
          } else {
            return s
          }
        } catch (err) {
          logger.error('Error while parsing ejs data and json:')
          logger.error(err)
          throw err
        }
      }
    }
  }


  async function sendSource(session: Session<never, never, Context>, source: RandomSource, elements: string[]) {
    try {
      const sendMechanic = sendMap[source.sendType]
      if (!sendMechanic) {
        await session.send(`不支持的发送类型: ${source.sendType}`)
        return
      }
      const filtered = elements.filter(s => sendMechanic.canSend(s, source))
      logger.info(`源数据量: ${elements.length}, 发送数据量: ${filtered.length}`)
      const selected = getRandom(filtered)
      if (selected && selected.length > 0) {
        const [msg] = await session.send(sendMechanic.toJsx(selected, source))
        if (source.recall > 0) {
          logger.debug(`设置${source.recall}分钟后撤回`)
          const timeout = setTimeout(() => session.bot.deleteMessage(session.channelId, msg), source.recall * 60000)
          recalls.add(timeout)
        }
      } else {
        await session.send('没有符合条件的结果')
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
