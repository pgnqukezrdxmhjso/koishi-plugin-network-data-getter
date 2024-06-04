import {Dict, Schema} from 'koishi'
import fs from "node:fs";
import path from "node:path";

export type SendType = 'image' | 'text' | 'ejs' | 'audio' | 'video' | 'file'
export type SplitType = 'json' | 'txt' | 'html' | 'plain' | 'resource'
export type RequestMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'PATCH' | 'PURGE' | 'LINK' | 'UNLINK'
export type RequestDataType = 'empty' | 'form-data' | 'x-www-form-urlencoded' | 'raw'
export type ProxyType = 'NONE' | 'GLOBAL' | 'MANUAL'

export interface CommandArg {
  name: string;
  desc?: string;
  type: 'string' | 'number' | 'user' | 'channel';
  required: boolean;
  autoOverwrite: boolean;
  overwriteKey?: string;
}

export interface CommandOption {
  name: string;
  acronym?: string;
  desc?: string;
  type: 'boolean' | 'string' | 'number' | 'user' | 'channel';
  value?: boolean | string | number;
  autoOverwrite: boolean;
  overwriteKey?: string;
}

export interface SourceExpert {
  commandArgs: CommandArg[];
  commandOptions: CommandOption[];
  requestHeaders: Dict<string, string>;
  requestDataType: RequestDataType;
  requestData?: string;
  requestFormFiles?: Dict<string, string>;
  requestJson?: boolean;
  proxyAgent?: string;
}

export interface RandomSource {
  command: string;
  alias: string[];
  desc: string;
  reverseGettingTips?: boolean;
  recall?: number;
  sourceUrl: string;
  requestMethod: RequestMethod;
  expertMode: boolean;
  expert?: SourceExpert;
  sendType: SendType;
  dataType: SplitType;

  jsonKey?: string;
  jquerySelector?: string;
  attribute?: string;
  ejsTemplate?: string;
}


export interface PresetConstant {
  name: string;
  type: 'boolean' | 'string' | 'number' | 'file';
  value?: boolean | string | number;
}

export interface PresetFn {
  name: string;
  args: string;
  body: string;
}

export interface ProxyConfig {
  proxyType: ProxyType;
  proxyAgent?: string;
  timeout?: number;
}

export interface PlatformResourceProxy extends ProxyConfig {
  name: string;
}

export interface ConfigExpert extends ProxyConfig {
  platformResourceProxyList?: PlatformResourceProxy[];
  presetConstants: PresetConstant[];
  presetFns: PresetFn[];
}

export interface Config {
  gettingTips: boolean;
  expertMode: boolean;
  expert?: ConfigExpert;
  sources: RandomSource[];
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

function proxyConfigSchema() {
  return [Schema.object({
    proxyType: Schema.union([
      Schema.const('NONE').description('無'),
      Schema.const('GLOBAL').description('全域性'),
      Schema.const('MANUAL').description('自定義'),
    ]).description('代理型別').role('radio').default('GLOBAL'),
  }),
    Schema.union([
      Schema.object({
        proxyType: Schema.const('MANUAL').required(),
        proxyAgent: Schema.string().description('地址').required(),
      }),
      Schema.object({} as any)
    ]),
    Schema.union([
      ...unionOrObject('proxyType', ['NONE', 'MANUAL'], () => ({
        timeout: Schema.number().description('請求超時時間').default(30 * 1000),
      })),
      Schema.object({} as any),
    ]),]
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.intersect([
    Schema.object({
      _versionHistory: Schema.object({
        _: Schema.never().description(fs.readFileSync(path.join(__dirname, './versionHistory.md')).toString())
      }).description('更新歷史').collapse(),
      gettingTips: Schema.boolean().description('獲取中提示').default(true),
      expertMode: Schema.boolean().description('專家模式').default(false),
    }).description('基礎設定'),
    Schema.union([
      Schema.object({
        expertMode: Schema.const(true).required(),
        expert: Schema.intersect([
          ...proxyConfigSchema(),
          Schema.object({
            platformResourceProxyList: Schema.array(Schema.intersect([
              Schema.object({
                name: Schema.string().description('平臺名').required(),
              }),
              ...proxyConfigSchema(),
            ])).description('平臺資源下載代理(平臺指discord、telegram等,資源指指令中的圖片、影片、音訊、檔案)').collapse(),
            presetConstants: Schema.array(Schema.intersect([
              Schema.object({
                name: Schema.string().description('常量名').required(),
                type: Schema.union([
                  Schema.const('boolean').description('布林'),
                  Schema.const('string').description('字串'),
                  Schema.const('number').description('數字'),
                  Schema.const('file').description('檔案'),
                ]).description('型別').default('string'),
              }),
              Schema.union([
                Schema.object({
                  type: Schema.const('boolean').required(),
                  value: Schema.boolean().default(true),
                }),
                Schema.object({
                  type: Schema.const('string'),
                  value: Schema.string().required(),
                }),
                Schema.object({
                  type: Schema.const('number').required(),
                  value: Schema.number().required(),
                }),
                Schema.object({
                  type: Schema.const('file').required(),
                  value: Schema.path().description('讀取檔案作為字串使用').required(),
                }),
                Schema.object({} as any)
              ])
            ])).description('預設常量，可在後續預設函式、配置中使用').collapse(),
            presetFns: Schema.array(Schema.object({
              name: Schema.string().description('函式名').required(),
              args: Schema.string().description('引數; 例如 a,b'),
              body: Schema.string().description('程式碼; 例如 return a+b').role('textarea').required(),
            })).description(
              '預設函式，可在後續配置中使用  \n' +
              '可使用的模組: 變數名  \n' +
              '[node:crypto](https://nodejs.org/docs/latest/api/crypto.html): crypto  \n' +
              '[TOTP](https://www.npmjs.com/package/otpauth?activeTab=readme): OTPAuth  \n'
            ).collapse(),
          }),
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
        desc: Schema.string().description('指令描述'),
        reverseGettingTips: Schema.boolean().description('對獲取中提示狀態取反').default(false),
        recall: Schema.number().description('訊息撤回時限(分鐘,0為不撤回)').default(0),
        sourceUrl: Schema.string().role('link').description('請求地址').required(),
        requestMethod: Schema.union(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE', 'PATCH', 'PURGE', 'LINK', 'UNLINK']).description('請求方法').default('GET'),
      }),
      Schema.object({
        dataType: Schema.union([
          Schema.const('json').description('JSON'),
          Schema.const('txt').description('多行文字'),
          Schema.const('resource').description('資源 (圖片/影片/音訊等)'),
          Schema.const('html').description('HTML 文字'),
          Schema.const('plain').description('後設資料, 供EJS模板使用')
        ]).description('資料返回型別').default('txt'),
      }),
      Schema.union([
        Schema.object({
          dataType: Schema.const('json').required(),
          jsonKey: Schema.string().description('使用JS程式碼進行巢狀取值, 支援使用[]代表迭代元素')
        }),
        Schema.object({
          dataType: Schema.const('html').required(),
          jquerySelector: Schema.string().description('jQuery 選擇器').default('p'),
          attribute: Schema.string().description('要提取的 HTML 元素屬性, 數值為空時獲取HTML元素內文字').default('')
        }),
        Schema.object({} as any)
      ]),
      Schema.object({
        sendType: Schema.union([
          Schema.const('image').description('圖片'),
          Schema.const('text').description('文字'),
          Schema.const('ejs').description('EJS 模板'),
          Schema.const('audio').description('音訊'),
          Schema.const('video').description('影片'),
          Schema.const('file').description('檔案')
        ]).description('傳送型別').default('text'),
      }),
      Schema.union([
        Schema.object({
          sendType: Schema.const('ejs').required(),
          ejsTemplate: Schema.string().role('textarea', {rows: [4, 10]}).description('EJS 模板').required(),
        }),
        Schema.object({} as any)
      ]),

      Schema.object({
        expertMode: Schema.boolean().description('專家模式').default(false),
      }),
      Schema.union([
        Schema.object({
          expertMode: Schema.const(true).required(),
          expert: Schema.intersect([
            Schema.object({
              commandArgs: Schema.array(Schema.intersect([
                Schema.object({
                  name: Schema.string().description('名稱').required(),
                  desc: Schema.string().description('描述'),
                  type: Schema.union([
                    Schema.const('string').description('字串'),
                    Schema.const('number').description('數字'),
                    Schema.const('user').description('用户'),
                    Schema.const('channel').description('頻道'),
                  ]).description('型別  \n字串型別可解析出引數中的圖片、語音、影片、檔案的url;啟用自動覆寫後可以自動覆蓋form-data中的檔案').default('string'),
                  required: Schema.boolean().description('必填').default(false),
                  autoOverwrite: Schema.boolean().description('自動覆寫body中同名key').default(false),
                }),
                Schema.union([
                  Schema.object({
                    autoOverwrite: Schema.const(true).required(),
                    overwriteKey: Schema.string().description('變為覆寫指定的key')
                  }),
                  Schema.object({} as any)
                ]),
              ])).description('引數配置').collapse(),
              commandOptions: Schema.array(Schema.intersect([
                Schema.object({
                  name: Schema.string().description('名稱').required(),
                  acronym: Schema.string().description('縮寫').pattern(/^[a-zA-Z0-9]?$/),
                  desc: Schema.string().description('描述'),
                  type: Schema.union([
                    Schema.const('boolean').description('布林'),
                    Schema.const('string').description('字串'),
                    Schema.const('number').description('數字'),
                    Schema.const('user').description('用户'),
                    Schema.const('channel').description('頻道'),
                  ]).description('型別  \n字串型別可解析出選項中的圖片、語音、影片、檔案的url;啟用自動覆寫後可以自動覆蓋form-data中的檔案').default('boolean'),
                }),
                Schema.union([
                  Schema.object({
                    type: Schema.const('boolean'),
                    value: Schema.boolean().description('選項固有值'),
                  }),
                  Schema.object({
                    type: Schema.const('string').required(),
                    value: Schema.string().description('選項固有值'),
                  }),
                  Schema.object({
                    type: Schema.const('number').required(),
                    value: Schema.number().description('選項固有值'),
                  }),
                  Schema.object({} as any)
                ]),
                Schema.object({
                  autoOverwrite: Schema.boolean().description('自動覆寫body中同名key').default(false),
                }),
                Schema.union([
                  Schema.object({
                    autoOverwrite: Schema.const(true).required(),
                    overwriteKey: Schema.string().description('變為覆寫指定的key')
                  }),
                  Schema.object({} as any)
                ]),
              ])).description('選項配置').collapse(),
              _prompt: Schema.never().description(
                '請求地址、請求頭、請求資料 中可以使用  \n' +
                '**<%=$數字%>** 插入對應位置的引數(引數是從0開始的)  \n' +
                '**<%=名稱%>** 插入同名的預設常量或引數或選項  \n' +
                '**<%=$e.路徑%>** 插入 [事件資料](https://satori.js.org/zh-CN/protocol/events.html#event)  \n' +
                '**<%= %>** 中允許使用js程式碼與預設函式 例如 `<%=JSON.stringify($e)%>` `<%=$0 || $1%>`'
              ),
              requestHeaders: Schema.dict(String).role('table').description('請求頭').default({}),
              requestDataType: Schema.union([Schema.const('empty').description('無'), 'form-data', 'x-www-form-urlencoded', 'raw']).description('資料型別').default('empty'),
            }),
            Schema.union([
              Schema.object({
                requestDataType: Schema.const('form-data').required(),
                requestData: Schema.string().role('textarea').description('請求資料(請輸入json)').default('{}'),
                requestFormFiles: Schema.dict(Schema.path()).description('請求檔案').default({}),
              }),
              Schema.object({
                requestDataType: Schema.const('x-www-form-urlencoded').required(),
                requestData: Schema.string().role('textarea').description('請求資料(請輸入json)').default('{}'),
              }),
              Schema.object({
                requestDataType: Schema.const('raw').required(),
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
    ]).description('--- \n ---')),
  }).description('指令設定')
])

const optionKeys: string[] = [
  'jsonKey',
  'jquerySelector',
  'attribute',
  'ejsTemplate'
]

export function extractOptions(source: RandomSource): object {
  const options: any = {}
  optionKeys.forEach(key => {
    if (source[key]) {
      options[key] = source[key]
    }
  })
  return options
}
