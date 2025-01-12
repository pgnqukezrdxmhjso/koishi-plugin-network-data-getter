import { Dict, HTTP, Schema } from "koishi";
import type { Font as VercelSatoriFont } from "satori";
import fs from "node:fs";
import path from "node:path";
import PresetFns from "./PresetFns";

export type CommandArgType = "string" | "number" | "user" | "channel" | "text";
export interface CommandArg {
  name: string;
  desc?: string;
  type: CommandArgType;
  required: boolean;
  autoOverwrite: boolean;
  overwriteKey?: string;
}

export type BaseTypeValue = boolean | string | number;
export type CommandOptionType = "boolean" | CommandArgType;
export interface CommandOption {
  name: string;
  acronym?: string;
  desc?: string;
  type: CommandOptionType;
  value?: BaseTypeValue;
  autoOverwrite: boolean;
  overwriteKey?: string;
}

export type HookFnsType = "SourceGetBefore" | "urlReqBefore" | "resDataBefore" | "renderedBefore";
export interface HookFn {
  type: HookFnsType;
  fn: string;
}

export type ResModifiedType = "none" | "LastModified" | "ETag" | "resDataHash";
export interface ResModified {
  type: ResModifiedType;
  ignoreUserCall?: boolean;
}

export type RequestDataType = "empty" | "form-data" | "x-www-form-urlencoded" | "raw";
export interface SourceExpert {
  scheduledTask?: boolean;
  cron?: string;
  scheduledTaskContent?: string;
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
  resModified: ResModified;
  disableUserCall: boolean;
  hookFns: HookFn[];
}

export type RendererPuppeteerRendererType = "html" | "url" | "ejs";
export type RendererPuppeteerWaitType = "selector" | "function" | "sleep";
export interface RendererPuppeteer {
  rendererType: RendererPuppeteerRendererType;
  ejsTemplate?: string;
  waitType: RendererPuppeteerWaitType;
  waitSelector?: string;
  waitFn?: string;
  waitTimeout?: number;
  waitTime?: number;
  screenshotSelector: string;
  screenshotOmitBackground: boolean;
}

export type RendererVercelSatoriRendererType = "ejs" | "jsx";
export type RendererVercelSatoriEmoji = "twemoji" | "blobmoji" | "noto" | "openmoji" | "fluent" | "fluentFlat";
export interface RendererVercelSatori {
  rendererType: RendererVercelSatoriRendererType;
  ejsTemplate?: string;
  jsx?: string;
  width: number;
  height: number;
  emoji: RendererVercelSatoriEmoji;
  debug: boolean;
}

export type CmdSourceType = "none" | "url" | "cmd";
export type CmdMessagePackingType = "inherit" | MessagePackingType;
export type MsgSendMode = "direct" | "topic";
export type SourceHttpErrorShowToMsg = "inherit" | HttpErrorShowToMsg | "function";
export type BaseProcessorType =
  | "json"
  | "plain"
  | "txt"
  | "html"
  | "resource"
  | "jsonObject"
  | "koishiElements"
  | "function";
export type RendererType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "koishiElements"
  | "ejs"
  | "cmdLink"
  | "puppeteer"
  | "vercelSatori";
export interface CmdSource {
  command: string;
  alias: string[];
  desc: string;
  reverseGettingTips?: boolean;
  messagePackingType: CmdMessagePackingType;
  recall?: number;

  sourceType: CmdSourceType;
  sourceUrl?: string;
  requestMethod?: HTTP.Method;
  sourceMultipleCmd?: boolean;
  sourceCmd?: string;

  dataType: BaseProcessorType;
  jsonKey?: string;
  jquerySelector?: string;
  attribute?: string;
  dataFunction?: string;
  jsonObject?: string;

  sendType: RendererType;
  pickOneRandomly: boolean;
  ejsTemplate?: string;
  multipleCmd?: boolean;
  cmdLink?: string;
  rendererPuppeteer?: RendererPuppeteer;
  rendererVercelSatori?: RendererVercelSatori;

  msgSendMode: MsgSendMode;
  msgTopic?: string;
  msgTopicModeUserCallDirect?: boolean;

  httpErrorShowToMsg: SourceHttpErrorShowToMsg;
  httpErrorShowToMsgFn?: string;

  expertMode: boolean;
  expert?: SourceExpert;
}

export type PresetConstantType = "boolean" | "string" | "number" | "file";
export interface PresetConstant {
  name: string;
  type: PresetConstantType;
  value?: BaseTypeValue;
}

export interface PresetFn {
  async: boolean;
  name: string;
  args: string;
  body: string;
}

export type ProxyType = "NONE" | "GLOBAL" | "MANUAL";
export interface ProxyConfig {
  proxyType: ProxyType;
  proxyAgent?: string;
  timeout?: number;
}

export interface PlatformResource extends ProxyConfig {
  name: string;
  requestHeaders: Dict<string, string>;
}
export type ConfigVercelSatoriFont = VercelSatoriFont & {
  path: string;
};
export interface ConfigExpert extends ProxyConfig {
  showDebugInfo: boolean;
  platformResourceList?: PlatformResource[];
  presetConstants: PresetConstant[];
  presetFns: PresetFn[];
  vercelSatoriFonts: ConfigVercelSatoriFont[];
}

export type MessagePackingType = "none" | "multiple" | "all";
export type HttpErrorShowToMsg = "hide" | "show";
export interface Config {
  anonymousStatistics: boolean;
  gettingTips: boolean;
  messagePackingType: MessagePackingType;
  httpErrorShowToMsg: HttpErrorShowToMsg;
  commandGroup: string;
  expertMode: boolean;
  expert?: ConfigExpert;
  sources: CmdSource[];
}

type SourceTypeValMap<T> = Record<CmdSourceType, T>;
type OrKeyValuesList = { key: string; values: string[] }[];
type OrSchemaFn = (values: string[]) => Record<any, any>;
function orItemGenerator(keyValuesList: OrKeyValuesList, schemaFn: OrSchemaFn) {
  const keys: string[] = [];
  let cartesianProduct: string[][] = [];

  for (let i = keyValuesList.length - 1; i >= 0; i--) {
    const orKeyValues = keyValuesList[i];
    keys.unshift(orKeyValues.key);
    const newCartesianProduct = [];
    for (const value of orKeyValues.values) {
      if (cartesianProduct.length === 0) {
        newCartesianProduct.push([value]);
      } else {
        for (const row of cartesianProduct) {
          newCartesianProduct.push([value, ...row]);
        }
      }
    }
    cartesianProduct = newCartesianProduct;
  }
  const schemaList = [];
  for (const row of cartesianProduct) {
    const obj = schemaFn(row.map((value) => value.replace(/^#/, "")));
    if (!obj) {
      continue;
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = row[i];
      if (value.startsWith("#")) {
        obj[key] = Schema.const(value.replace(/^#/, ""));
      } else {
        obj[key] = Schema.const(value).required();
      }
    }
    schemaList.push(Schema.object(obj));
  }
  return schemaList;
}

function orGenerator(keyValuesList: OrKeyValuesList, schemaFn: OrSchemaFn) {
  const items = orItemGenerator(keyValuesList, schemaFn);
  items.push(Schema.object({}));
  return Schema.union(items);
}
function when<T>(isTrue: boolean, obj: T, elseObj?: T): T {
  return isTrue ? obj : elseObj || ((Array.isArray(obj) ? [] : {}) as T);
}

function proxyConfigSchema() {
  return [
    Schema.object({
      proxyType: Schema.union([
        Schema.const("NONE").description("無"),
        Schema.const("GLOBAL").description("全域性"),
        Schema.const("MANUAL").description("自定義"),
      ])
        .description("代理型別")
        .role("radio")
        .default("GLOBAL"),
    }),
    Schema.union([
      Schema.object({
        proxyType: Schema.const("MANUAL").required(),
        proxyAgent: Schema.string().description("地址").required(),
      }),
      Schema.object({}),
    ]),
    orGenerator([{ key: "proxyType", values: ["NONE", "MANUAL"] }], () => ({
      timeout: Schema.number()
        .description("請求超時時間")
        .default(30 * 1000),
    })),
  ];
}

const CommonSchema = {
  inherit: Schema.const("inherit").description("繼承"),
};

export const Config: Schema<Config> = Schema.intersect([
  Schema.intersect([
    Schema.object({
      _versionHistory: Schema.object({
        _: Schema.never().description(
          fs
            .readFileSync(path.join(__dirname, "../readme.md"))
            .toString()
            .replace(/^[\s\S]*# VersionHistory/, ""),
        ),
      })
        .collapse()
        .description("更新歷史"),
      anonymousStatistics: Schema.boolean().default(true).description("匿名資料統計（記錄插件啟用的次數）"),
      gettingTips: Schema.boolean().default(true).description("獲取中提示"),
      messagePackingType: Schema.union([
        Schema.const("none").description("不合並"),
        Schema.const("multiple").description("合併多條"),
        Schema.const("all").description("全部合併"),
      ])
        .default("none")
        .description("訊息合併"),
      httpErrorShowToMsg: Schema.union([
        Schema.const("hide").description("隱藏"),
        Schema.const("show").description("顯示"),
      ])
        .default("hide")
        .description("http報錯是否顯示在回覆訊息中"),
      commandGroup: Schema.string().default("net-get").description("指令分組"),
      expertMode: Schema.boolean().default(false).description("專家模式"),
    }).description("基礎設定"),
    Schema.union([
      Schema.object({
        expertMode: Schema.const(true).required(),
        expert: Schema.intersect([
          ...proxyConfigSchema(),
          Schema.object({
            showDebugInfo: Schema.boolean().default(false),
            platformResourceList: Schema.array(
              Schema.intersect([
                Schema.object({
                  name: Schema.string().required().description("平臺名"),
                  requestHeaders: Schema.dict(String).role("table").default({}).description("請求頭"),
                }),
                ...proxyConfigSchema(),
              ]),
            )
              .collapse()
              .description("平臺資源下載配置(平臺指discord、telegram等,資源指指令中的圖片、影片、音訊、檔案)"),
            presetConstants: Schema.array(
              Schema.intersect([
                Schema.object({
                  name: Schema.string().required().description("常量名"),
                  type: Schema.union([
                    Schema.const("boolean").description("布林"),
                    Schema.const("string").description("字串"),
                    Schema.const("number").description("數字"),
                    Schema.const("file").description("檔案"),
                  ])
                    .default("string")
                    .description("型別"),
                }),
                Schema.union([
                  Schema.object({
                    type: Schema.const("boolean").required(),
                    value: Schema.boolean(),
                  }),
                  Schema.object({
                    type: Schema.const("string"),
                    value: Schema.string().required(),
                  }),
                  Schema.object({
                    type: Schema.const("number").required(),
                    value: Schema.number().required(),
                  }),
                  Schema.object({
                    type: Schema.const("file").required(),
                    value: Schema.path().required().description("讀取檔案作為字串使用"),
                  }),
                  Schema.object({}),
                ]),
              ]),
            )
              .collapse()
              .description("預設常量，可在後續預設函式、配置中使用"),
            presetFns: Schema.array(
              Schema.object({
                async: Schema.boolean()
                  .default(false)
                  .description("非同步函式(在後續的使用中需要在非同步函式前書寫await)"),
                name: Schema.string().required().description("函式名"),
                args: Schema.string().description("引數; 例如 a,b"),
                body: Schema.string().role("textarea").required().description("程式碼; 例如 return a+b"),
              }),
            )
              .default(PresetFns)
              .collapse()
              .description("預設函式，可在後續配置中使用  \n" + "可使用 **_modules** 描述的內容  \n"),
            vercelSatoriFonts: Schema.array(
              Schema.object({
                path: Schema.path()
                  .required()
                  .description(
                    "字型檔案。 vercel/satori 目前支援三種字型格式：TTF、OTF、WOFF。請注意，目前不支援 WOFF2",
                  ),
                name: Schema.string().required(),
                weight: Schema.union([
                  Schema.const(100),
                  Schema.const(200),
                  Schema.const(300),
                  Schema.const(400),
                  Schema.const(500),
                  Schema.const(600),
                  Schema.const(700),
                  Schema.const(800),
                  Schema.const(900),
                ]).default(400),
                style: Schema.union([Schema.const("normal"), Schema.const("italic")])
                  .default("normal")
                  .role("radio"),
              }),
            )
              .collapse()
              .description("vercel/satori 渲染型別 需要使用到的字型"),
          }),
        ]),
      }),
      Schema.object({} as any),
    ]),
  ]),
  Schema.object({
    _modules: Schema.never().description(
      "模組名: 變數名  \n" +
        "[node:crypto](https://nodejs.org/docs/latest/api/crypto.html): **crypto**  \n" +
        "[TOTP](https://www.npmjs.com/package/otpauth?activeTab=readme): **OTPAuth**  \n" +
        "[http](https://koishi.chat/zh-CN/plugins/develop/http.html): **http**  \n" +
        "[資料快取服務](https://cache.koishi.chat/zh-CN/): **cache**  \n" +
        "[輸出日誌](https://koishi.chat/zh-CN/api/utils/logger.html#%E7%B1%BB-logger): **logger**  \n",
    ),
    _internalFns: Schema.never().description(
      "內建函式  \n" +
        "**await $urlToString({url,reqConfig})** [reqConfig](https://github.com/cordiverse/http/blob/8a5199b143080e385108cacfe9b7e4bbe9f223ed/packages/core/src/index.ts#L98)  \n" +
        "**await $urlToBase64({url,reqConfig})**  \n",
    ),
    _values: Schema.never().description(
      "**$數字** 對應位置的引數(引數是從0開始的)  \n" +
        "**名稱** 同名的預設常量、引數、選項  \n" +
        "**$e.路徑** [事件資料](https://satori.js.org/zh-CN/protocol/events.html#event)  \n" +
        "**$tmpPool** 每個請求獨立的臨時儲存，可以自由修改其中的變數  \n",
    ),
    _prompt: Schema.never().description(
      "可使用 **_modules** 描述的內容,在此處使用需要在變數名前加 **$** 例如 **$cache.get**  \n" +
        "可使用 **_internalFns** 描述的內容  \n" +
        "可使用 **_values** 描述的內容  \n",
    ),
    _prompt2: Schema.never().description(
      "可使用 **_prompt** 描述的內容  \n" +
        "此處使用需要用 **<%=  %>** 包裹 例如 **<%= $cache.get %>**  \n" +
        "**<%= %>** 中允許使用 js程式碼 例如 <%=JSON.stringify($e)%> <%=$0 || $1%>  \n",
    ),
  }),
  Schema.object({
    sources: Schema.array(
      Schema.intersect([
        Schema.object({
          command: Schema.string().required().description("指令名稱"),
          alias: Schema.array(Schema.string()).default([]).description("指令別名"),
          desc: Schema.string().description("指令描述"),
          reverseGettingTips: Schema.boolean().default(false).description("對獲取中提示狀態取反"),
          messagePackingType: Schema.union([
            CommonSchema.inherit,
            Schema.const("none").description("不合並"),
            Schema.const("multiple").description("合併多條"),
            Schema.const("all").description("全部合併"),
          ])
            .default("inherit")
            .description("訊息合併"),
          recall: Schema.number().default(0).description("訊息撤回時限(分鐘,0為不撤回)"),
          sourceType: Schema.union([
            Schema.const("none").description("無"),
            Schema.const("url").description("網路 url"),
            Schema.const("cmd").description("指令"),
          ])
            .default("url")
            .description("資料來源型別"),
        }),
        Schema.union([
          Schema.object({
            sourceType: Schema.const("url"),
            sourceUrl: Schema.string()
              .role("textarea", { rows: [1, 99] })
              .required()
              .description("請求地址 可使用 **_prompt2** 描述的內容"),
            requestMethod: Schema.union(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "PURGE", "LINK", "UNLINK"])
              .default("GET")
              .description("請求方法"),
          }),
          Schema.object({
            sourceType: Schema.const("cmd"),
            sourceMultipleCmd: Schema.boolean()
              .default(false)
              .description("開啟後支援每行寫一條指令，但是失去一條指令內換行的功能"),
            sourceCmd: Schema.string()
              .role("textarea", { rows: [2, 99] })
              .required()
              .description("指令  \n" + "示範: echo <%=$0%>  \n" + "可使用 **_prompt2** 描述的內容  \n"),
          }),
          Schema.object({}),
        ]),
        orGenerator([{ key: "sourceType", values: ["none", "#url", "cmd"] }], ([value]) => ({
          dataType: Schema.union([
            ...when(value === "none", [Schema.const("jsonObject").description("JSON 固定字串")]),
            ...when(value === "url", [
              Schema.const("json").description("JSON 選擇器"),
              Schema.const("plain").description("JSON 原文"),
              Schema.const("txt").description("文字"),
              Schema.const("html").description("HTML CSS選擇器"),
              Schema.const("resource").description("資源 (圖片/影片/音訊等)"),
            ]),
            ...when(value === "cmd", [Schema.const("koishiElements").description("koishi標準元素")]),
            Schema.const("function").description("自定義函式"),
          ])
            .default(
              ({ none: "jsonObject", url: "txt", cmd: "koishiElements" } as SourceTypeValMap<BaseProcessorType>)[value],
            )
            .description("響應資料處理器"),
        })),
        Schema.union([
          Schema.object({
            sourceType: Schema.const("none").required(),
            dataType: Schema.const("jsonObject"),
            jsonObject: Schema.string()
              .role("textarea", { rows: [3, 99] })
              .default('["test"]')
              .description(
                "填寫的json將會傳遞給渲染器 填寫非[]與{}的型別將會自動包裹[]  \n" +
                  "可使用 **_prompt2** 描述的內容  \n",
              ),
          }),
          Schema.object({
            sourceType: Schema.const("url"),
            dataType: Schema.const("json").required(),
            jsonKey: Schema.string().description("使用JS程式碼進行巢狀取值, 支援使用[]代表迭代元素"),
          }),
          Schema.object({
            sourceType: Schema.const("url"),
            dataType: Schema.const("html").required(),
            jquerySelector: Schema.string()
              .default("p")
              .description("[CSS 選擇器](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_selectors)"),
            attribute: Schema.string().default("").description("要提取的 HTML 元素屬性, 數值為空時獲取HTML元素內文字"),
          }),
          ...orItemGenerator([{ key: "sourceType", values: ["none", "#url", "cmd"] }], ([value]) => ({
            dataType: Schema.const("function").required(),
            dataFunction: Schema.string()
              .role("textarea", { rows: [3, 99] })
              .default(
                "return " +
                  ({ none: '["test"]', url: "$response.data", cmd: "$elements" } as SourceTypeValMap<string>)[value],
              )
              .description(
                "**return** 返回的值將會傳遞給渲染器 返回非[]與{}的型別將會自動包裹[]  \n" +
                  "可使用 **_prompt** 描述的內容  \n" +
                  (
                    {
                      none: "",
                      url: "#可額外使用  \n **$response** [HTTP.Response](https://github.com/cordiverse/http/blob/8a5199b143080e385108cacfe9b7e4bbe9f223ed/packages/core/src/index.ts#L109)  \n",
                      cmd: "#可額外使用  \n **$elements** [koishi標準元素](https://koishi.chat/zh-CN/api/message/elements.html)",
                    } as SourceTypeValMap<string>
                  )[value],
              ),
          })),
          Schema.object({}),
        ]),
        orGenerator([{ key: "sourceType", values: ["none", "#url", "cmd"] }], ([value]) => ({
          sendType: Schema.union([
            ...when(value !== "cmd", [
              Schema.const("text").description("文字"),
              Schema.const("image").description("圖片"),
              Schema.const("audio").description("音訊"),
              Schema.const("video").description("影片"),
              Schema.const("file").description("檔案"),
            ]),
            Schema.const("cmdLink").description("指令鏈"),
            ...when(value === "cmd", [Schema.const("koishiElements").description("koishi標準元素")]),
            Schema.const("ejs").description("EJS 模板"),
            Schema.const("puppeteer").description("html截圖 (速度慢，資源消耗高 需要安裝 puppeteer 插件)"),
            Schema.const("vercelSatori").description(
              "vercel/satori (速度快，資源消耗低 需要安裝 vercel-satori-png-service 插件)",
            ),
          ])
            .default(({ none: "text", url: "text", cmd: "koishiElements" } as SourceTypeValMap<RendererType>)[value])
            .description("渲染型別"),
        })),
        orGenerator(
          [
            { key: "sourceType", values: ["none", "#url", "cmd"] },
            {
              key: "sendType",
              values: [
                "#text",
                "image",
                "audio",
                "video",
                "file",
                "cmdLink",
                "#koishiElements",
                "ejs",
                "puppeteer",
                "vercelSatori",
              ],
            },
          ],
          ([sourceType, sendType]) => {
            if (
              (["none", "url"].includes(sourceType) && ["koishiElements"].includes(sendType)) ||
              (["cmd"].includes(sourceType) && ["text", "image", "audio", "video", "file"].includes(sendType))
            ) {
              return;
            }
            return {
              pickOneRandomly: Schema.boolean()
                .default(!["koishiElements", "ejs", "puppeteer", "vercelSatori"].includes(sendType))
                .description("從多行結果中隨機選擇一條。 複雜資料將會被展平後隨機選擇一條"),
            };
          },
        ),
        orGenerator(
          [
            { key: "sourceType", values: ["none", "#url", "cmd"] },
            { key: "sendType", values: ["ejs", "cmdLink", "puppeteer", "vercelSatori"] },
          ],
          ([sourceType, sendType]) => {
            return {
              ejs: {
                ejsTemplate: Schema.string()
                  .role("textarea", { rows: [3, 99] })
                  .default(when(sourceType === "cmd", "<%-$data%>", "<%=$data%>"))
                  .description(
                    "[EJS 模板](https://github.com/mde/ejs/blob/main/docs/syntax.md)  \n" +
                      "此處使用的是[koishi標準元素](https://koishi.chat/zh-CN/api/message/elements.html)  \n" +
                      "可使用 **_prompt2** 描述的內容  \n" +
                      "#可額外使用  \n" +
                      "**$data** 響應資料處理器返回的值",
                  ),
              },
              cmdLink: {
                multipleCmd: Schema.boolean()
                  .default(false)
                  .description("開啟後支援每行寫一條指令，但是失去一條指令內換行的功能"),
                cmdLink: Schema.string()
                  .role("textarea", { rows: [2, 99] })
                  .required()
                  .description(
                    "指令鏈  \n" +
                      "示範: echo <%=$data%>  \n" +
                      "可使用 **_prompt2** 描述的內容  \n" +
                      "#可額外使用  \n" +
                      "**$data** 響應資料處理器返回的值",
                  ),
              },
              puppeteer: {
                rendererPuppeteer: Schema.intersect([
                  Schema.object({
                    _explain: Schema.never().description(
                      "在網頁中可以透過 **_netGet.xx** 使用 **_values** 描述的內容  \n" +
                        "#可額外使用  \n" +
                        "**_netGet.$data** 響應資料處理器返回的值",
                    ),
                    rendererType: Schema.union([
                      Schema.const("html").description("html程式碼"),
                      Schema.const("url").description("網站地址"),
                      Schema.const("ejs").description("EJS 模板"),
                    ])
                      .default("html")
                      .description("渲染型別"),
                  }),
                  Schema.union([
                    Schema.object({
                      rendererType: Schema.const("ejs").required(),
                      ejsTemplate: Schema.string()
                        .role("textarea", { rows: [3, 99] })
                        .default(when(sourceType === "cmd", "<%-$data%>", "<%=$data%>"))
                        .description(
                          "[EJS 模板](https://github.com/mde/ejs/blob/main/docs/syntax.md)  \n" +
                            "可使用 **_prompt2** 描述的內容  \n" +
                            "#可額外使用  \n" +
                            "**$data** 響應資料處理器返回的值",
                        ),
                    }),
                    Schema.object({}),
                  ]),
                  Schema.object({
                    waitType: Schema.union([
                      Schema.const("selector").description("css選擇器"),
                      Schema.const("function").description("自定義函式"),
                      Schema.const("sleep").description("定時"),
                    ])
                      .default("selector")
                      .description("等待載入型別"),
                  }),
                  Schema.union([
                    Schema.object({
                      waitType: Schema.const("selector"),
                      waitSelector: Schema.string()
                        .default("body")
                        .description("等待目標元素 [CSS 選擇器](https://pptr.dev/guides/page-interactions#selectors)"),
                      waitTimeout: Schema.number().default(30_000).description("超時時間"),
                    }),
                    Schema.object({
                      waitType: Schema.const("function").required(),
                      waitFn: Schema.string()
                        .role("textarea", { rows: [3, 99] })
                        .required()
                        .description("在頁面中執行的函式，**return true**後結束等待, 可以使用await"),
                      waitTimeout: Schema.number().default(30_000).description("超時時間"),
                    }),
                    Schema.object({
                      waitType: Schema.const("sleep").required(),
                      waitTime: Schema.number().default(3_000).description("等待時間"),
                    }),
                    Schema.object({}),
                  ]),
                  Schema.object({
                    screenshotSelector: Schema.string()
                      .default("body")
                      .description("截圖目標元素 [CSS 選擇器](https://pptr.dev/guides/page-interactions#selectors)"),
                    screenshotOmitBackground: Schema.boolean().default(false).description("透明背景"),
                  }),
                ]),
              },
              vercelSatori: {
                sendType: Schema.const("vercelSatori").required(),
                rendererVercelSatori: Schema.intersect([
                  Schema.object({
                    rendererType: Schema.union([
                      Schema.const("jsx").description("jsx"),
                      Schema.const("ejs").description("EJS 模板"),
                    ])
                      .default("jsx")
                      .description("渲染型別"),
                    _explain: Schema.never().description(
                      "vercel/satori 支援有限的 HTML 和 CSS [檢視詳情](https://github.com/vercel/satori?tab=readme-ov-file#html-elements)",
                    ),
                  }),
                  Schema.union([
                    Schema.object({
                      rendererType: Schema.const("jsx"),
                      jsx: Schema.string()
                        .role("textarea", { rows: [3, 99] })
                        .default(
                          `<div style={{display: 'flex', flexDirection: 'column'}}>${when(sourceType === "cmd", "{$data}", "{JSON.stringify($data)}")}</div>`,
                        )
                        .description(
                          "[vercel/satori JSX](https://github.com/vercel/satori#overview)  \n" +
                            "可使用 **_prompt** 描述的內容  \n" +
                            "#可額外使用  \n" +
                            "**$data** 響應資料處理器返回的值",
                        ),
                    }),
                    Schema.object({
                      rendererType: Schema.const("ejs").required(),
                      ejsTemplate: Schema.string()
                        .role("textarea", { rows: [3, 99] })
                        .default(
                          `<div style="display: flex; flex-direction: column;">${when(sourceType === "cmd", "<%-$data%>", "<%=JSON.stringify($data)%>")}</div>`,
                        )
                        .description(
                          "[EJS 模板](https://github.com/mde/ejs/blob/main/docs/syntax.md)  \n" +
                            "可使用 **_prompt2** 描述的內容  \n" +
                            "#可額外使用  \n" +
                            "**$data** 響應資料處理器返回的值",
                        ),
                    }),
                    Schema.object({}),
                  ]),
                  Schema.object({
                    width: Schema.number(),
                    height: Schema.number(),
                    emoji: Schema.union([
                      Schema.const("twemoji"),
                      Schema.const("blobmoji"),
                      Schema.const("noto"),
                      Schema.const("openmoji"),
                      Schema.const("fluent"),
                      Schema.const("fluentFlat"),
                    ])
                      .default("twemoji")
                      .description("表情符號風格"),
                    debug: Schema.boolean().default(false).description("顯示影象上的除錯資訊"),
                  }),
                ]),
              },
            }[sendType];
          },
        ),

        Schema.object({
          msgSendMode: Schema.union([
            Schema.const("direct").description("直接傳送"),
            Schema.const("topic").description("主題推送(需要安裝 message-topic-service 插件)"),
          ])
            .default("direct")
            .description("訊息傳送模式"),
        }),
        Schema.union([
          Schema.object({
            msgSendMode: Schema.const("topic").required(),
            msgTopic: Schema.string().description(
              "推送到的主題，使用.分隔子主題  \n" +
                "不填寫時預設使用 net-get.指令名  \n" +
                "使用當前指令的 --topic-on 訂閱推送 --topic-off 退訂推送",
            ),
            msgTopicModeUserCallDirect: Schema.boolean().default(false).description("由使用者發起的指令, 依舊直接傳送"),
          }),
          Schema.object({}),
        ]),

        Schema.object({
          httpErrorShowToMsg: Schema.union([
            CommonSchema.inherit,
            Schema.const("hide").description("隱藏"),
            Schema.const("show").description("顯示"),
            Schema.const("function").description("自定義函式"),
          ])
            .default("inherit")
            .description("http報錯是否顯示在回覆訊息中"),
        }),
        Schema.union([
          Schema.object({
            httpErrorShowToMsg: Schema.const("function").required(),
            httpErrorShowToMsgFn: Schema.string()
              .role("textarea", { rows: [3, 99] })
              .required()
              .description(
                "**return** 返回的值將會加入回覆訊息中  \n" +
                  "可使用 **_prompt** 描述的內容  \n" +
                  "#可額外使用  \n" +
                  "**$response** [HTTP.Response](https://github.com/cordiverse/http/blob/8a5199b143080e385108cacfe9b7e4bbe9f223ed/packages/core/src/index.ts#L109)  \n" +
                  "**$error** [HTTPError](https://github.com/cordiverse/http/blob/8a5199b143080e385108cacfe9b7e4bbe9f223ed/packages/core/src/index.ts#L30)",
              ),
          }),
          Schema.object({}),
        ]),
        Schema.object({
          expertMode: Schema.boolean().default(false).description("專家模式"),
        }),
        orGenerator([{ key: "sourceType", values: ["none", "#url", "cmd"] }], ([value]) => ({
          expertMode: Schema.const(true).required(),
          expert: Schema.intersect([
            ...when(value !== "cmd", [
              Schema.object({
                scheduledTask: Schema.boolean()
                  .default(false)
                  .description("定時執行 (需要安裝 cron 插件)  \n" + "必須將 訊息傳送模式 設定為 主題推送"),
              }),
              Schema.union([
                Schema.object({
                  scheduledTask: Schema.const(true).required(),
                  cron: Schema.string().required().description("[cron 表示式](https://cron.koishi.chat/)"),
                  scheduledTaskContent: Schema.string().description(
                    "定時執行的內容，不需要在前面寫指令名稱  \n" +
                      "定時執行的指令中無法使用  \n" +
                      "插值: $e  \n" +
                      "引數型別: 用户 頻道  \n" +
                      "渲染型別: 指令鏈",
                  ),
                }),
                Schema.object({}),
              ]),
            ]),
            Schema.object({
              commandArgs: Schema.array(
                Schema.intersect([
                  Schema.object({
                    name: Schema.string().required().description("名稱"),
                    desc: Schema.string().description("描述"),
                    type: Schema.union([
                      Schema.const("string").description("字串"),
                      Schema.const("number").description("數字"),
                      Schema.const("user").description("用户"),
                      Schema.const("channel").description("頻道"),
                      Schema.const("text").description("長文字"),
                    ])
                      .default("string")
                      .description(
                        "型別  \n" +
                          "字串型別可解析出引數中的圖片、語音、影片、檔案的url;啟用自動覆寫後可以自動覆蓋form-data中的檔案  \n" +
                          "用戶型別可使用[GuildMember](https://satori.js.org/zh-CN/resources/member.html#guildmember)對象的資料,直接使用頂層對象將自動變為 `id:nick`  \n" +
                          "頻道型別可使用[Channel](https://satori.js.org/zh-CN/resources/channel.html#channel)對象的資料,直接使用頂層對象將自動變為 `id:name`  \n" +
                          "長文字型別會將後續所有內容全部當作一個整體",
                      ),
                    required: Schema.boolean().default(false).description("必填"),
                    autoOverwrite: Schema.boolean().default(false).description("自動覆寫body中同名key"),
                  }),
                  Schema.union([
                    Schema.object({
                      autoOverwrite: Schema.const(true).required(),
                      overwriteKey: Schema.string().description("變為覆寫指定的key"),
                    }),
                    Schema.object({}),
                  ]),
                ]),
              )
                .collapse()
                .description("引數配置"),
              commandOptions: Schema.array(
                Schema.intersect([
                  Schema.object({
                    name: Schema.string().required().description("名稱"),
                    acronym: Schema.string()
                      .pattern(/^[a-zA-Z0-9]+$/)
                      .description("縮寫"),
                    desc: Schema.string().description("描述"),
                    type: Schema.union([
                      Schema.const("boolean").description("布林"),
                      Schema.const("string").description("字串"),
                      Schema.const("number").description("數字"),
                      Schema.const("user").description("用户"),
                      Schema.const("channel").description("頻道"),
                      Schema.const("text").description("長文字"),
                    ])
                      .default("boolean")
                      .description(
                        "型別  \n" +
                          "字串型別可解析出引數中的圖片、語音、影片、檔案的url;啟用自動覆寫後可以自動覆蓋form-data中的檔案  \n" +
                          "用戶型別可使用[GuildMember](https://satori.js.org/zh-CN/resources/member.html#guildmember)對象的資料,直接使用頂層對象將自動變為 `id:nick`  \n" +
                          "頻道型別可使用[Channel](https://satori.js.org/zh-CN/resources/channel.html#channel)對象的資料,直接使用頂層對象將自動變為 `id:name`  \n" +
                          "長文字型別會將後續所有內容全部當作一個整體",
                      ),
                  }),
                  Schema.union([
                    Schema.object({
                      type: Schema.const("boolean"),
                      value: Schema.boolean().description("選項固有值"),
                    }),
                    Schema.object({
                      type: Schema.const("string").required(),
                      value: Schema.string().description("選項固有值"),
                    }),
                    Schema.object({
                      type: Schema.const("number").required(),
                      value: Schema.number().description("選項固有值"),
                    }),
                    Schema.object({}),
                  ]),
                  Schema.object({
                    autoOverwrite: Schema.boolean().default(false).description("自動覆寫body中同名key"),
                  }),
                  Schema.union([
                    Schema.object({
                      autoOverwrite: Schema.const(true).required(),
                      overwriteKey: Schema.string().description("變為覆寫指定的key"),
                    }),
                    Schema.object({}),
                  ]),
                ]),
              )
                .collapse()
                .description("選項配置"),
              ...when(value === "url", {
                requestHeaders: Schema.dict(String)
                  .role("table")
                  .default({})
                  .description("請求頭 可使用 **_prompt2** 描述的內容"),
                requestDataType: Schema.union([
                  Schema.const("empty").description("無"),
                  "form-data",
                  "x-www-form-urlencoded",
                  "raw",
                ])
                  .default("empty")
                  .description("資料型別"),
              }),
            }),
            ...when(value === "url", [
              Schema.union([
                Schema.object({
                  requestDataType: Schema.const("form-data").required(),
                  requestForm: Schema.dict(String).role("table").description("請求資料 可使用 **_prompt2** 描述的內容"),
                  requestFormFiles: Schema.dict(Schema.path()).default({}).description("請求檔案"),
                }),
                Schema.object({
                  requestDataType: Schema.const("x-www-form-urlencoded").required(),
                  requestForm: Schema.dict(String).role("table").description("請求資料 可使用 **_prompt2** 描述的內容"),
                }),
                Schema.object({
                  requestDataType: Schema.const("raw").required(),
                  requestJson: Schema.boolean().default(true).description("請求資料是否為 JSON"),
                  requestRaw: Schema.string()
                    .role("textarea")
                    .default("")
                    .description("請求資料 可使用 **_prompt2** 描述的內容"),
                }),
                Schema.object({}),
              ]),
            ]),
            Schema.object({
              proxyAgent: Schema.string().description("代理地址，本指令獨享"),
              renderedMediaUrlToBase64: Schema.boolean()
                .default(true)
                .description(
                  "響應資料處理器不為資源與返回了$urlToBase64呼叫結果的自定義函式  \n" +
                    "並且渲染型別為 資源類、vercel/satori 時自動將url下載後轉base64  \n" +
                    "此配置可使用本插件的代理配置下載資料",
                ),
            }),
            Schema.union([
              Schema.object({
                renderedMediaUrlToBase64: Schema.const(true),
                rendererRequestHeaders: Schema.dict(String)
                  .role("table")
                  .default({})
                  .description("渲染 資源類、vercel/satori 請求頭 可使用 **_prompt2** 描述的內容"),
              }),
              Schema.object({}),
            ]),
            Schema.object({
              resModified: Schema.intersect([
                Schema.object({
                  type: Schema.union([
                    Schema.const("none").description("無"),
                    ...when(value === "url", [
                      Schema.const("LastModified").description("Last-Modified與If-Modified-Since"),
                      Schema.const("ETag").description("ETag與If-None-Match"),
                    ]),
                    Schema.const("resDataHash").description("響應資料處理器的返回值的hash"),
                  ])
                    .default("none")
                    .description("判斷響應內容是否有變化，設定後無變化的響應不會傳送訊息"),
                }),
                orGenerator([{ key: "type", values: ["LastModified", "ETag", "resDataHash"] }], () => ({
                  ignoreUserCall: Schema.boolean().default(false).description("由使用者發起的指令不進行判斷"),
                })),
              ]),
            }),
            Schema.object({
              disableUserCall: Schema.boolean()
                .default(false)
                .description("不執行由使用者發起的指令  \n" + "以下情況除外  \n" + "訂閱推送"),
            }),
            Schema.object({
              hookFns: Schema.array(
                Schema.intersect([
                  Schema.object({
                    type: Schema.union([
                      Schema.const("SourceGetBefore").description("獲取資料前"),
                      ...when(value === "url", [
                        Schema.const("urlReqBefore").description('獲取資料 "網路 url" 傳送請求前'),
                      ]),
                      Schema.const("resDataBefore").description("響應資料處理前"),
                      Schema.const("renderedBefore").description("渲染前"),
                    ])
                      .required()
                      .description("型別"),
                    _explain: Schema.never().description(
                      "可使用 **_prompt** 描述的內容  \n" +
                        "**return false** 阻斷執行  \n" +
                        '**return "字串"** 阻斷執行並返回訊息  \n',
                    ),
                  }),
                  Schema.union([
                    ...when(value === "url", [
                      Schema.object({
                        type: Schema.const("urlReqBefore").required(),
                        _explain1: Schema.never().description(
                          "#可額外使用  \n" +
                            "**$url**  \n" +
                            "**$requestConfig** [HTTP.RequestConfig](https://github.com/cordiverse/http/blob/8a5199b143080e385108cacfe9b7e4bbe9f223ed/packages/core/src/index.ts#L98)",
                        ),
                      }),
                    ]),
                    Schema.object({
                      type: Schema.const("resDataBefore").required(),
                      _explain1: Schema.never().description(
                        "#可額外使用  \n" +
                          "**$response** [HTTP.Response](https://github.com/cordiverse/http/blob/8a5199b143080e385108cacfe9b7e4bbe9f223ed/packages/core/src/index.ts#L109)",
                      ),
                    }),
                    Schema.object({
                      type: Schema.const("renderedBefore").required(),
                      _explain1: Schema.never().description("#可額外使用  \n" + "**$resData** [] | {}"),
                    }),
                    Schema.object({}),
                  ]),
                  Schema.object({
                    fn: Schema.string()
                      .role("textarea", { rows: [3, 99] })
                      .required(),
                  }),
                ]),
              )
                .collapse()
                .description("鉤子函式"),
            }),
          ]),
        })),
      ]).description("--- \n ---"),
    ),
  }).description("指令設定"),
]);
