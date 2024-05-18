import {Dict, Schema} from 'koishi'

export type SendType = 'image' | 'text' | 'ejs' | 'audio' | 'video' | 'file'
// 'image' is drepcated, use resource instead
export type SplitType = 'json' | 'txt' | 'image' | 'html' | 'plain' | 'resource'
export type RequestMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'PATCH' | 'PURGE' | 'LINK' | 'UNLINK'
export type RequestDataType = 'empty' | 'form-data' | 'x-www-form-urlencoded' | 'raw'
export type ProxyType = 'NONE' | 'GLOBAL' | 'MANUAL'

export interface SourceExpert {
  requestHeaders: Dict<string, string>,
  requestDataType: RequestDataType,
  requestData?: string,
  requestFormFiles?: Dict<string, string>,
  requestJson?: boolean,
  proxyAgent?: string,
}

export interface RandomSource {
  command: string,
  alias: string[],
  gettingTips: boolean,
  recall?: number,
  sourceUrl: string,
  requestMethod: RequestMethod,
  expertMode: boolean,
  expert?: SourceExpert,
  sendType: SendType,
  dataType: SplitType,

  jsonKey?: string,
  jquerySelector?: string,
  attribute?: string,
  ejsTemplate?: string,
}

const optionKeys: string[] = [
  'jsonKey',
  'jquerySelector',
  'attribute',
  'ejsTemplate'
]

export interface Config {
  gettingTips: boolean,
  expertMode: boolean,
  expert?: {
    proxyType: ProxyType,
    proxyAgent?: string,
    timeout?: number,
  },
  sources: RandomSource[],
}

function unionOrObject(
  key: string,
  values: string[] | { value: string, required: boolean }[],
  fn: () => Dict
) {
  const list = [];
  values.forEach((value: any) => {
    const obj = fn();
    if (typeof value === 'string') {
      obj[key] = Schema.const(value).required();
    } else {
      obj[key] = value.required ? Schema.const(value.value).required() : Schema.const(value.value);
    }
    list.push(Schema.object(obj));
  });
  return list;
}


export const Config: Schema<Config> = Schema.intersect([
  Schema.intersect([
    Schema.object({
      gettingTips: Schema.boolean().description('獲取中提示, 關閉後全域性無提示').default(true),
      expertMode: Schema.boolean().description('專家模式').default(false),
    }).description('基礎設定'),
    Schema.union([
      Schema.object({
        expertMode: Schema.const(true).required(),
        expert: Schema.intersect([
          Schema.object({
            proxyType: Schema.union([
              Schema.const('NONE').description('無'),
              Schema.const('GLOBAL').description('全域性'),
              Schema.const('MANUAL').description('自定義'),
            ]).description('代理型別').role('radio').default('GLOBAL'),
          }),
          Schema.union([Schema.object({
            proxyType: Schema.const('MANUAL').required(),
            proxyAgent: Schema.string().description('地址').required(),
          }), Schema.object({} as any)]),
          Schema.union([
            ...unionOrObject('proxyType', ['NONE', 'MANUAL'], () => ({
              timeout: Schema.number().description('請求超時時間').default(30 * 1000),
            })),
            Schema.object({} as any),
          ]),
        ])
      }),
      Schema.object({} as any)
    ]),
  ]),
  Schema.object({
    sources: Schema.array(Schema.intersect([
      Schema.object({
        command: Schema.string().description('指令名稱').required(),
        alias: Schema.array(Schema.string()).description('指令別名').default([]),
        gettingTips: Schema.boolean().description('獲取中提示').default(true),
        recall: Schema.number().description('訊息撤回時限(分鐘,0為不撤回)').default(0),
        sourceUrl: Schema.string().role('link').description('請求地址').required(),
        requestMethod: Schema.union(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE', 'PATCH', 'PURGE', 'LINK', 'UNLINK']).description('請求方法').default('GET'),
        expertMode: Schema.boolean().description('專家模式').default(false),
      }),
      Schema.union([
        Schema.object({
          expertMode: Schema.const(true).required(),
          expert: Schema.intersect([
            Schema.object({
              requestHeaders: Schema.dict(String).role('table').description('請求頭').default({}),
              requestDataType: Schema.union([Schema.const('empty').description('無'), 'form-data', 'x-www-form-urlencoded', 'raw']).description('資料型別').default('raw'),
            }),
            Schema.union([
              Schema.object({
                requestDataType: Schema.const('form-data').required(),
                requestData: Schema.string().role('textarea').description('請求資料(請輸入json)').default('{}'),
                requestFormFiles: Schema.dict(Schema.path()).description('請求文件').default({}),
              }),
              Schema.object({
                requestDataType: Schema.const('x-www-form-urlencoded').required(),
                requestData: Schema.string().role('textarea').description('請求資料(請輸入json)').default('{}'),
              }),
              Schema.object({
                requestDataType: Schema.const('raw'),
                requestJson: Schema.boolean().description('請求資料是否為 JSON').default(true),
                requestData: Schema.string().role('textarea').description('請求資料').default(''),
              }),
              Schema.object({} as any)
            ]),
            Schema.object({
              proxyAgent: Schema.string().description('代理地址，本指令獨享'),
            })
          ])
        }),
        Schema.object({} as any),
      ]),
      Schema.object({
        sendType: Schema.union([
          Schema.const('image').description('圖片'),
          Schema.const('text').description('文字'),
          Schema.const('ejs').description('EJS 模板'),
          Schema.const('audio').description('音訊'),
          Schema.const('video').description('影片'),
          Schema.const('file').description('文件')
        ]).description('傳送型別').default('text'),
        dataType: Schema.union([
          Schema.const('json').description('JSON'),
          Schema.const('txt').description('多行文字'),
          Schema.const('image').description('圖片').deprecated(),
          Schema.const('resource').description('資源 (圖片/影片/音訊等)'),
          Schema.const('html').description('HTML 文字'),
          Schema.const('plain').description('後設資料, 供EJS模板使用')
        ]).description('資料返回型別').default('txt'),
      }),
      Schema.union([
        Schema.object({
          dataType: Schema.const('json').required(),
          jsonKey: Schema.string().description('使用JS程式碼進行巢狀取值, 支援使用[]代表迭代元素')
        }).description('資料返回型別 - 額外配置'),
        Schema.object({
          dataType: Schema.const('html').required(),
          jquerySelector: Schema.string().description('jQuery 選擇器').default('p'),
          attribute: Schema.string().description('要提取的 HTML 元素屬性, 數值為空時獲取HTML元素內文字').default('')
        }).description('資料返回型別 - 額外配置'),
        Schema.object({} as any)
      ]),
      Schema.union([
        Schema.object({
          sendType: Schema.const('ejs').required(),
          ejsTemplate: Schema.string().role('textarea', {rows: [4, 10]}).description('EJS 模板').required(),
        }).description('傳送型別 - 額外配置'),
        Schema.object({} as any)
      ])
    ]).description('---')),
  }).description('指令設定')
])


export function extractOptions(source: RandomSource): object {
  const options: any = {}
  optionKeys.forEach(key => {
    if (source[key]) {
      options[key] = source[key]
    }
  })
  return options
}
