import {Context, Fragment, Session} from "koishi";
import {SendType} from "./config";
import {getRandom} from "./utils";
import {render} from 'ejs'
import {logger} from "./logger";

interface SendMechanic {
  canSend: (s: string, options?: any) => boolean
  toJsx: (s: string, options?: any) => (any | Fragment)
}

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
    toJsx: (s: string, options?: any) => {
      try {
        const data = JSON.parse(s)
        const {ejsTemplate} = options;
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


export async function sendSource(session: Session<never, never, Context>, type: SendType, source: string[], recall?: number, options?: any) {
  try {
    const sendMechanic = sendMap[type]
    if (!sendMechanic) {
      await session.send(`不支持的发送类型: ${type}`)
      return
    }
    const filtered = source.filter(s => sendMechanic.canSend(s, options))
    logger.info(`源数据量: ${source.length}, 发送数据量: ${filtered.length}`)
    const selected = getRandom(filtered)
    if (selected && selected.length > 0) {
      const [msg] = await session.send(sendMechanic.toJsx(selected, options))
      if (recall > 0) {
        logger.debug(`设置${recall}分钟后撤回`)
        const timeout = setTimeout(() => session.bot.deleteMessage(session.channelId, msg), recall * 60000)
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

export function clearRecalls() {
  recalls.forEach(timeout => clearTimeout(timeout))
  recalls.clear()
}
