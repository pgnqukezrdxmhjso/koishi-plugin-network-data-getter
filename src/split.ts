import {AxiosResponse} from "axios";
import {RandomSource, SplitType} from "./config";
import {parseJson, parseObjectToArr} from "./utils";
import {parse} from 'node-html-parser';
import {logger} from "./logger";


const splitMap: { [key in SplitType]: (res: AxiosResponse, source: RandomSource) => string[] } = {
  json: (res: AxiosResponse, source: RandomSource) => {
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
  txt: (res: AxiosResponse) => {
    return (res.data as string).split('\n')
  },
  html: (res: AxiosResponse, source: RandomSource) => {
    const {jquerySelector: selector, attribute} = source
    const root = parse(res.data)
    return Array.from(root.querySelectorAll(selector ?? 'p')).map(e => attribute ? e.getAttribute(attribute) : e.structuredText)
  },
  plain: (res: AxiosResponse) => {
    return [JSON.stringify(res.data)];
  },
  resource: (res: AxiosResponse) => {
    return [res.request.res.responseUrl];
  }
}

export function parseSource(res: AxiosResponse, source: RandomSource): string[] {
  const parser = splitMap[source.dataType];
  if (!parser) {
    throw new Error(`未知的分隔类型: ${source.dataType}`);
  }
  const result = parser(res, source);
  logger.debug(`${source.dataType} 的分隔结果: ${result}`);
  return result;
}
