import {Dict, HTTP, Schema} from 'koishi'

import PresetFns from './PresetFns'
import fs from "node:fs";
import path from "node:path";

export type BaseProcessorType = 'json' | 'txt' | 'html' | 'plain' | 'resource';
export type RendererType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'ejs' | 'cmdLink';
export type RequestDataType = 'empty' | 'form-data' | 'x-www-form-urlencoded' | 'raw';
export type ProxyType = 'NONE' | 'GLOBAL' | 'MANUAL';
export type OptionValue = boolean | string | number;
export type CommandType = 'string' | 'number' | 'user' | 'channel' | 'text';
export type MessagePackingType = 'none' | 'multiple' | 'all';

export interface CommandArg {
  name: string;
  desc?: string;
  type: CommandType;
  required: boolean;
  autoOverwrite: boolean;
  overwriteKey?: string;
}

export interface CommandOption {
  name: string;
  acronym?: string;
  desc?: string;
  type: 'boolean' | CommandType;
  value?: OptionValue;
  autoOverwrite: boolean;
  overwriteKey?: string;
}

export interface SourceExpert {
  commandArgs: CommandArg[];
  commandOptions: CommandOption[];
  requestHeaders: Dict<string, string>;
  requestDataType: RequestDataType;
  requestRaw?: string;
  requestForm?: Dict<string, string>;
  requestFormFiles?: Dict<string, string>;
  requestJson?: boolean;
  proxyAgent?: string;
  renderedMediaUrlToBase64: boolean;
  rendererRequestHeaders?: Dict<string, string>;
}

export interface CmdSource {
  command: string;
  alias: string[];
  desc: string;
  reverseGettingTips?: boolean;
  messagePackingType: 'inherit' | MessagePackingType;
  recall?: number;
  sourceUrl: string;
  requestMethod: HTTP.Method;

  dataType: BaseProcessorType;
  jsonKey?: string;
  jquerySelector?: string;
  attribute?: string;
  pickOneRandomly?: boolean;

  sendType: RendererType;
  ejsTemplate?: string;
  cmdLink?: string;

  expertMode: boolean;
  expert?: SourceExpert;
}


export interface PresetConstant {
  name: string;
  type: 'boolean' | 'string' | 'number' | 'file';
  value?: OptionValue;
}

export interface PresetFn {
  async: boolean;
  name: string;
  args: string;
  body: string;
}

export interface ProxyConfig {
  proxyType: ProxyType;
  proxyAgent?: string;
  timeout?: number;
}

export interface PlatformResource extends ProxyConfig {
  name: string;
  requestHeaders: Dict<string, string>;
}

export interface ConfigExpert extends ProxyConfig {
  platformResourceList?: PlatformResource[];
  presetConstants: PresetConstant[];
  presetFns: PresetFn[];
}

export interface Config {
  anonymousStatistics: boolean;
  gettingTips: boolean;
  messagePackingType: MessagePackingType;
  expertMode: boolean;
  expert?: ConfigExpert;
  sources: CmdSource[];
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
        _: Schema.never().description(fs.readFileSync(path.join(__dirname, '../readme.md')).toString().replace(/^[\s\S]*# VersionHistory/, ''))
      }).collapse().description('更新歷史'),
      anonymousStatistics: Schema.boolean().default(true).description('匿名資料統計（記錄插件啟用的次數）'),
      gettingTips: Schema.boolean().default(true).description('獲取中提示'),
      messagePackingType: Schema.union([
        Schema.const('none').description('不合並'),
        Schema.const('multiple').description('合併多條'),
        Schema.const('all').description('全部合併'),
      ]).default('none').description('訊息合併'),
      expertMode: Schema.boolean().default(false).description('專家模式'),
    }).description('基礎設定'),
    Schema.union([
      Schema.object({
        expertMode: Schema.const(true).required(),
        expert: Schema.intersect([
          ...proxyConfigSchema(),
          Schema.object({
            platformResourceList: Schema.array(Schema.intersect([
              Schema.object({
                name: Schema.string().required().description('平臺名'),
                requestHeaders: Schema.dict(String).role('table').default({}).description('請求頭'),
              }),
              ...proxyConfigSchema(),
            ])).collapse().description('平臺資源下載配置(平臺指discord、telegram等,資源指指令中的圖片、影片、音訊、檔案)'),
            presetConstants: Schema.array(Schema.intersect([
              Schema.object({
                name: Schema.string().required().description('常量名'),
                type: Schema.union([
                  Schema.const('boolean').description('布林'),
                  Schema.const('string').description('字串'),
                  Schema.const('number').description('數字'),
                  Schema.const('file').description('檔案'),
                ]).default('string').description('型別'),
              }),
              Schema.union([
                Schema.object({
                  type: Schema.const('boolean').required(),
                  value: Schema.boolean(),
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
                  value: Schema.path().required().description('讀取檔案作為字串使用'),
                }),
                Schema.object({} as any)
              ])
            ])).collapse().description('預設常量，可在後續預設函式、配置中使用'),
            presetFns: Schema.array(Schema.object({
              async: Schema.boolean().default(false).description('非同步函式(在後續的使用中需要在非同步函式前書寫await)'),
              name: Schema.string().required().description('函式名'),
              args: Schema.string().description('引數; 例如 a,b'),
              body: Schema.string().role('textarea').required().description('程式碼; 例如 return a+b'),
            })).default(PresetFns).collapse().description(
              '預設函式，可在後續配置中使用  \n' +
              '可使用的模組: 變數名  \n' +
              '[node:crypto](https://nodejs.org/docs/latest/api/crypto.html): crypto  \n' +
              '[TOTP](https://www.npmjs.com/package/otpauth?activeTab=readme): OTPAuth  \n' +
              '[http](https://koishi.chat/zh-CN/plugins/develop/http.html): http  \n'
            ),
          }),
        ])
      }),
      Schema.object({} as any)
    ]),
  ]),
  Schema.object({
    sources: Schema.array(Schema.intersect([
      Schema.object({
        command: Schema.string().required().description('指令名稱'),
        alias: Schema.array(Schema.string()).default([]).description('指令別名'),
        desc: Schema.string().description('指令描述'),
        reverseGettingTips: Schema.boolean().default(false).description('對獲取中提示狀態取反'),
        messagePackingType: Schema.union([
          Schema.const('inherit').description('繼承'),
          Schema.const('none').description('不合並'),
          Schema.const('multiple').description('合併多條'),
          Schema.const('all').description('全部合併'),
        ]).description('訊息合併'),
        recall: Schema.number().default(0).description('訊息撤回時限(分鐘,0為不撤回)'),
        sourceUrl: Schema.string().role('textarea', {rows: [1, 9]}).required().description('請求地址'),
        requestMethod: Schema.union(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'PURGE', 'LINK', 'UNLINK']).default('GET')
          .description('請求方法'),
      }),
      Schema.object({
        dataType: Schema.union([
          Schema.const('json').description('JSON'),
          Schema.const('txt').description('多行文字'),
          Schema.const('html').description('HTML 文字'),
          Schema.const('resource').description('資源 (圖片/影片/音訊等)'),
          Schema.const('plain').description('JSONRaw')
        ]).default('txt').description('資料返回型別'),
      }),
      Schema.union([
        Schema.object({
          dataType: Schema.const('json').required(),
          jsonKey: Schema.string().description('使用JS程式碼進行巢狀取值, 支援使用[]代表迭代元素'),
          pickOneRandomly: Schema.boolean().default(true).description('從多行結果中隨機選擇一條')
        }),
        Schema.object({
          dataType: Schema.const('txt'),
          pickOneRandomly: Schema.boolean().default(true).description('從多行結果中隨機選擇一條')
        }),
        Schema.object({
          dataType: Schema.const('html').required(),
          jquerySelector: Schema.string().default('p').description('jQuery 選擇器'),
          attribute: Schema.string().default('').description('要提取的 HTML 元素屬性, 數值為空時獲取HTML元素內文字'),
          pickOneRandomly: Schema.boolean().default(true).description('從多行結果中隨機選擇一條')
        }),
        Schema.object({} as any)
      ]),

      Schema.object({
        sendType: Schema.union([
          Schema.const('text').description('文字'),
          Schema.const('image').description('圖片'),
          Schema.const('audio').description('音訊'),
          Schema.const('video').description('影片'),
          Schema.const('file').description('檔案'),
          Schema.const('ejs').description('EJS 模板'),
          Schema.const('cmdLink').description('指令鏈'),
        ]).default('text').description('渲染型別'),
      }),
      Schema.union([
        Schema.object({
          sendType: Schema.const('ejs').required(),
          ejsTemplate: Schema.string().role('textarea', {rows: [3, 9]}).required()
            .description('EJS 模板'),
        }),
        Schema.object({
          sendType: Schema.const('cmdLink').required(),
          cmdLink: Schema.string().role('textarea', {rows: [2, 9]}).required()
            .description('指令鏈'),
        }),
        Schema.object({} as any)
      ]),

      Schema.object({
        expertMode: Schema.boolean().default(false).description('專家模式'),
      }),
      Schema.union([
        Schema.object({
          expertMode: Schema.const(true).required(),
          expert: Schema.intersect([
            Schema.object({
              commandArgs: Schema.array(Schema.intersect([
                Schema.object({
                  name: Schema.string().required().description('名稱'),
                  desc: Schema.string().description('描述'),
                  type: Schema.union([
                    Schema.const('string').description('字串'),
                    Schema.const('number').description('數字'),
                    Schema.const('user').description('用户'),
                    Schema.const('channel').description('頻道'),
                    Schema.const('text').description('長文字'),
                  ]).default('string')
                    .description('型別  \n' +
                      '字串型別可解析出引數中的圖片、語音、影片、檔案的url;啟用自動覆寫後可以自動覆蓋form-data中的檔案  \n' +
                      '用戶型別可使用[GuildMember](https://satori.js.org/zh-CN/resources/member.html#guildmember)對象的資料,直接使用頂層對象將自動變為 `id:nick`  \n' +
                      '頻道型別可使用[Channel](https://satori.js.org/zh-CN/resources/channel.html#channel)對象的資料,直接使用頂層對象將自動變為 `id:name`  \n' +
                      '長文字型別會將後續所有內容全部當作一個整體'
                    ),
                  required: Schema.boolean().default(false).description('必填'),
                  autoOverwrite: Schema.boolean().default(false).description('自動覆寫body中同名key'),
                }),
                Schema.union([
                  Schema.object({
                    autoOverwrite: Schema.const(true).required(),
                    overwriteKey: Schema.string().description('變為覆寫指定的key')
                  }),
                  Schema.object({} as any)
                ]),
              ])).collapse().description('引數配置'),
              commandOptions: Schema.array(Schema.intersect([
                Schema.object({
                  name: Schema.string().required().description('名稱'),
                  acronym: Schema.string().pattern(/^[a-zA-Z0-9]+$/).description('縮寫'),
                  desc: Schema.string().description('描述'),
                  type: Schema.union([
                    Schema.const('boolean').description('布林'),
                    Schema.const('string').description('字串'),
                    Schema.const('number').description('數字'),
                    Schema.const('user').description('用户'),
                    Schema.const('channel').description('頻道'),
                    Schema.const('text').description('長文字'),
                  ]).default('boolean')
                    .description('型別  \n' +
                      '字串型別可解析出引數中的圖片、語音、影片、檔案的url;啟用自動覆寫後可以自動覆蓋form-data中的檔案  \n' +
                      '用戶型別可使用[GuildMember](https://satori.js.org/zh-CN/resources/member.html#guildmember)對象的資料,直接使用頂層對象將自動變為 `id:nick`  \n' +
                      '頻道型別可使用[Channel](https://satori.js.org/zh-CN/resources/channel.html#channel)對象的資料,直接使用頂層對象將自動變為 `id:name`  \n' +
                      '長文字型別會將後續所有內容全部當作一個整體'
                    ),
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
                  autoOverwrite: Schema.boolean().default(false).description('自動覆寫body中同名key'),
                }),
                Schema.union([
                  Schema.object({
                    autoOverwrite: Schema.const(true).required(),
                    overwriteKey: Schema.string().description('變為覆寫指定的key')
                  }),
                  Schema.object({} as any)
                ]),
              ])).collapse().description('選項配置'),
              _prompt: Schema.never().description(
                '#請求地址 | 請求頭 | 請求資料 | 指令鏈 | EJS 模板 配置項中可使用  \n' +
                '**<%=$數字%>** 插入對應位置的引數(引數是從0開始的)  \n' +
                '**<%=名稱%>** 插入同名的預設常量或引數或選項  \n' +
                '**<%=$e.路徑%>** 插入 [事件資料](https://satori.js.org/zh-CN/protocol/events.html#event)  \n' +
                '**<%= %>** 中允許使用 js程式碼 | 內建函式 | 預設常量 | 預設函式 例如 <%=JSON.stringify($e)%> <%=$0 || $1%>  \n' +
                '#指令鏈 | EJS 模板 配置項中可額外使用  \n' +
                '**<%=$data%>** 插入返回的資料  \n' +
                '#內建函式  \n' +
                '**await $urlToString({url,reqConfig})** [reqConfig](https://github.com/cordiverse/http/blob/b2da31b7cfef8b8490961037b2ba08c6efc6d03f/packages/core/src/index.ts#L99)  \n' +
                '**await $urlToBase64({url,reqConfig})**  \n'
              ),
              requestHeaders: Schema.dict(String).role('table').default({}).description('請求頭'),
              requestDataType:
                Schema.union([
                  Schema.const('empty').description('無'),
                  'form-data', 'x-www-form-urlencoded', 'raw'
                ]).default('empty').description('資料型別'),
            }),
            Schema.union([
              Schema.object({
                requestDataType: Schema.const('form-data').required(),
                requestForm: Schema.dict(String).role('table').description('請求資料'),
                requestFormFiles: Schema.dict(Schema.path()).default({}).description('請求檔案'),
              }),
              Schema.object({
                requestDataType: Schema.const('x-www-form-urlencoded').required(),
                requestForm: Schema.dict(String).role('table').description('請求資料'),
              }),
              Schema.object({
                requestDataType: Schema.const('raw').required(),
                requestJson: Schema.boolean().default(true).description('請求資料是否為 JSON'),
                requestRaw: Schema.string().role('textarea').default('').description('請求資料'),
              }),
              Schema.object({} as any)
            ]),
            Schema.object({
              proxyAgent: Schema.string().description('代理地址，本指令獨享'),
              renderedMediaUrlToBase64: Schema.boolean().default(true)
                .description('渲染型別為資源類時自動將url下載後轉base64  \n此配置可使用本插件的代理配置下載資料'),
            }),
            Schema.union([
              Schema.object({
                renderedMediaUrlToBase64: Schema.const(true),
                rendererRequestHeaders: Schema.dict(String).role('table').default({}).description('渲染資源類請求頭'),
              }),
              Schema.object({})
            ])
          ])
        }),
        Schema.object({} as any),
      ]),
    ]).description('--- \n ---')),
  }).description('指令設定')
]);
