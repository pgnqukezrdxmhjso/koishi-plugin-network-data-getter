import {AxiosResponse} from "axios";
import {SplitType} from "./config";
import {parseJson, parseObjectToArr} from "./utils";
import {parseData} from "./data-convert";
import {parse} from 'node-html-parser';
import {logger} from "./logger";


const splitMap: { [key in SplitType]: (data: any, options?: any) => string[] } = {
  json: (data: any, options?: any) => {
    if (typeof data === 'string') {
      logger.debug('json data is string, try to parse it', data)
      data = JSON.parse(data.replace('<br>', '\\n'))
    }
    const key: string | undefined = options?.jsonKey
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
  txt: (data: any) => {
    return (data as string).split('\n')
  },
  html: (data: any, options?: any) => {
    const {jquerySelector: selector, attribute} = options
    const root = parse(data)
    return Array.from(root.querySelectorAll(selector ?? 'p')).map(e => attribute ? e.getAttribute(attribute) : e.structuredText)
  },
  plain: (data: any) => [JSON.stringify(data)],
  resource: (data: any) => [data]
}

export function parseSource(res: AxiosResponse, type: SplitType, options?: any): string[] {
  const data = parseData(res, type)
  const parser = splitMap[type]
  if (!parser) {
    throw new Error(`未知的分隔类型: ${type}`)
  }
  const result = parser(data, options)
  logger.debug(`${type} 的分隔结果: ${result}`)
  return result
}
