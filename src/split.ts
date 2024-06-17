import {parse} from 'node-html-parser';
import {HTTP} from "koishi";
import {parseJson, parseObjectToArr} from "./utils";
import {RandomSource, SplitType} from "./config";
import {logger} from "./logger";


const splitMap: { [key in SplitType]: (res: HTTP.Response, source: RandomSource) => string[] } = {
  json: (res: HTTP.Response, source: RandomSource) => {
    let data = res.data;
    if (typeof data === 'string') {
      logger.debug('json data is string, try to parse it', data)
      data = JSON.parse(data.replace('<br>', '\\n'))
    }
    const key: string | undefined = source?.jsonKey
    let elements: any[]
    let target = data
    if (key) {
      // avoid injection
      target = parseJson(data, key.replaceAll(/[;{}]/g, ''))
    }
    elements = parseObjectToArr(target)
    return elements
      .filter(s => typeof s === 'string')
      .map(s => s as string)
  },
  txt: (res: HTTP.Response) => {
    return (res.data as string).split('\n')
  },
  html: (res: HTTP.Response, source: RandomSource) => {
    const {jquerySelector: selector, attribute} = source
    const root = parse(res.data)
    return Array.from(root.querySelectorAll(selector ?? 'p')).map(e => attribute ? e.getAttribute(attribute) : e.structuredText)
  },
  plain: (res: HTTP.Response) => {
    return [JSON.stringify(res.data)];
  },
  resource: (res: HTTP.Response) => {
    return [res.url];
  }
}

export function parseSource(res: HTTP.Response, source: RandomSource): string[] {
  const parser = splitMap[source.dataType];
  if (!parser) {
    throw new Error(`未知的分隔类型: ${source.dataType}`);
  }
  const result = parser(res, source);
  logger.debug(`${source.dataType} 的分隔结果: ${result}`);
  return result;
}
