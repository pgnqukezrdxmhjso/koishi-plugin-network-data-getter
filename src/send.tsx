import { Context, Fragment, Session } from "koishi";
import { SendType } from "./config";
import { getRandom } from "./utils";
import { render } from 'ejs'

interface SendMechanic {
    can_send: (s: string, options?: any) => boolean
    to_jsx: (s: string, options?: any) => Fragment
}

const recalls = new Set<NodeJS.Timeout>()


const sendMap: { [key in SendType]: SendMechanic } = {
    'text': {
        can_send: (s: string) => s.length > 0,
        to_jsx: (s: string) => s
    },

    'image': {
        can_send: (s: string) => s.startsWith('http') || s.startsWith('data:image/'),
        to_jsx: (s: string) => <image url={s} />
    },

    'ejs': {
        can_send: (s: string) => true,
        to_jsx: (s: string, options?: any) => {
            try {
                const data = JSON.parse(s)
                const { ejs_template } = options;
                if (ejs_template) {
                    return render(ejs_template, {data})
                }
            } catch(err) {
                console.error('Error while parsing ejs data and json:')
                console.error(err)
            }
            return s // fallback
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
        const filtered = source.filter(s => sendMechanic.can_send(s, options))
        console.info(`源数据量: ${source.length}, 发送数据量: ${filtered.length}`)
        const selected = getRandom(filtered)
        if (selected && selected.length > 0) {
            const [msg] = await session.send(sendMechanic.to_jsx(selected, options))
            if (recall > 0) {
                console.debug(`设置${recall}分钟后撤回`)
                const timeout = setTimeout(() => session.bot.deleteMessage(session.channelId, msg), recall * 60000)
                recalls.add(timeout)
            }
        } else {
            await session.send('没有符合条件的结果')
        }
    }catch(err){
        console.error(err)
        await session.send(`发送失败: ${err?.message ?? err}`)
    }
}

export function clearRecalls() {
    recalls.forEach(timeout => clearTimeout(timeout))
    recalls.clear()
}