import {Dict, Schema} from 'koishi'

export type SendType = 'image' | 'text' | 'ejs' | 'audio' | 'video' | 'file'
// 'image' is drepcated, use resource instead
export type SplitType = 'json' | 'txt' | 'image' | 'html' | 'plain' | 'resource'
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RandomSource {
  command: string
  alias: string[]
  source_url: string
  request_method: RequestMethod
  request_headers: Dict<string, string>,
  request_data: string,
  request_json: boolean,
  getting_tips: boolean,
  send_type: SendType
  data_type: SplitType
  recall?: number

  json_key?: string
  jquery_selector?: string
  attribute?: string,
  ejs_template?: string
}

const option_keys: string[] = [
  'json_key',
  'jquery_selector',
  'attribute',
  'ejs_template'
]

export interface Config {
  getting_tips: boolean,
  sources: RandomSource[]
}


export const Config: Schema<Config> = Schema.object({
  getting_tips: Schema.boolean().description('獲取中提示, 關閉後全局無提示').default(true),
  sources: Schema.array(Schema.intersect([
    Schema.object({
      command: Schema.string().description('指令名稱').required(),
      alias: Schema.array(Schema.string()).description('指令別名').default([]),
      source_url: Schema.string().description('數據源地址').required(),
      request_method: Schema.union(['GET', 'POST', 'PUT', 'DELETE']).description('請求方法').default('GET'),
      request_headers: Schema.dict(String).role('table').description('請求頭').default({}),
      request_data: Schema.string().role('textarea').description('請求數據').default(''),
      request_json: Schema.boolean().description('請求數據是否為 JSON').default(false),
      getting_tips: Schema.boolean().description('獲取中提示').default(true),
      recall: Schema.number().description('消息撤回時限(分鐘,0為不撤回)').default(0),
      send_type: Schema.union([
        Schema.const('image').description('圖片'),
        Schema.const('text').description('文本'),
        Schema.const('ejs').description('EJS 模板'),
        Schema.const('audio').description('音頻'),
        Schema.const('video').description('視頻'),
        Schema.const('file').description('文件')
      ]).description('發送類型').default('text'),
      data_type: Schema.union([
        Schema.const('json').description('JSON'),
        Schema.const('txt').description('多行文本'),
        Schema.const('image').description('圖片').deprecated(),
        Schema.const('resource').description('資源 (圖片/視頻/音頻等)'),
        Schema.const('html').description('HTML 文本'),
        Schema.const('plain').description('元數據, 供EJS模板使用')
      ]).description('數據返回類型').default('txt'),
    }),
    Schema.union([
      Schema.object({
        data_type: Schema.const('json').required(),
        json_key: Schema.string().description('使用JS代碼進行嵌套取值, 支援使用[]代表迭代元素')
      }).description('數據返回類型 - 額外配置'),
      Schema.object({
        data_type: Schema.const('html').required(),
        jquery_selector: Schema.string().description('jQuery 選擇器').default('p'),
        attribute: Schema.string().description('要提取的 HTML 元素屬性, 數值為空時獲取HTML元素內文字').default('')
      }).description('數據返回類型 - 額外配置'),
      Schema.object({} as any)
    ]),
    Schema.union([
      Schema.object({
        send_type: Schema.const('ejs').required(),
        ejs_template: Schema.string().role('textarea', {rows: [4, 10]}).description('EJS 模板').required(),
      }).description('發送類型 - 額外配置'),
      Schema.object({} as any)
    ])
  ])),
})


export function extractOptions(source: RandomSource): object {
  const options: any = {}
  option_keys.forEach(key => {
    if (source[key]) {
      options[key] = source[key]
    }
  })
  return options
}
