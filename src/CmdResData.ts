import {parse} from 'node-html-parser';
import {HTTP} from "koishi";
import {parseJson, parseObjectToArr} from "./utils";
import {RandomSource, SplitType} from "./config";

export interface ResData {
  json?: {} | [];
  texts?: string[];
  text?: string
}

type BaseProcessorMap = {
  [key in SplitType]: (res: HTTP.Response, source: RandomSource) => ResData
}


const baseProcessorMap: BaseProcessorMap = {
  json: (res: HTTP.Response, source: RandomSource) => {
    let data = res.data;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    const key = source?.jsonKey
    let elements: any[]
    let target = data
    if (key) {
      target = parseJson(data, key.replaceAll(/[;{}]/g, ''))
    }
    elements = parseObjectToArr(target)
    return {
      texts: elements
        .filter(s => typeof s === 'string')
    }
  },
  txt: (res: HTTP.Response) => {
    return {
      texts: (res.data as string).split('\n')
    }
  },
  html: (res: HTTP.Response, source: RandomSource) => {
    const {jquerySelector: selector, attribute} = source
    const root = parse(res.data)
    return {
      texts: Array.from(root.querySelectorAll(selector ?? 'p')).map(e => attribute ? e.getAttribute(attribute) : e.structuredText)
    }
  },
  resource: (res: HTTP.Response) => {
    return {
      texts: [res.url]
    };
  },
  plain: (res: HTTP.Response) => {
    return {
      json: typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    }
  },

}

export function cmdResData(res: HTTP.Response, source: RandomSource): ResData {
  const parser = baseProcessorMap[source.dataType];
  if (!parser) {
    throw new Error(`未知的分隔类型: ${source.dataType}`);
  }
  return parser(res, source);
}
