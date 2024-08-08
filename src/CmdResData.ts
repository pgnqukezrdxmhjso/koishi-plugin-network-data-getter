import {parse} from 'node-html-parser';
import {HTTP, Random} from "koishi";
import {parseJson, parseObjectToArr} from "./utils";
import {BaseProcessorType, CmdSource} from "./Config";
import Strings from "./utils/Strings";
import {rendererMap} from "./Renderer";
import Arrays from "./utils/Arrays";

export interface ResData {
  json?: {} | [];
  texts?: string[];
}

type BaseProcessorMap = {
  [key in BaseProcessorType]: (res: HTTP.Response, source: CmdSource) => ResData
}

function handleTexts(texts: string[], source: CmdSource) {
  texts = texts.filter(text => Strings.isNotBlank(text));
  const verify = rendererMap[source.sendType]?.verify;
  if (verify) {
    texts = texts.filter(text => verify(text));
  }
  if (source.pickOneRandomly) {
    texts = [Random.pick(texts)];
  }
  if (Arrays.isEmpty(texts)) {
    throw ('沒有符合條件的結果');
  }
  return texts;
}

const baseProcessorMap: BaseProcessorMap = {
  json: (res: HTTP.Response, source: CmdSource) => {
    let data = res.data;
    if (data instanceof ArrayBuffer) {
      data = JSON.parse(Buffer.from(data).toString());
    } else if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    const key = source?.jsonKey;
    let texts: any[];
    let target = data;
    if (key) {
      target = parseJson(data, key.replaceAll(/[;{}]/g, ''));
    }
    texts = parseObjectToArr(target);
    for (let i = 0; i < texts.length; i++) {
      if (typeof texts[i] !== 'string') {
        texts[i] += '';
      }
    }
    texts = handleTexts(texts, source);
    return {texts};
  },
  txt: (res: HTTP.Response, source: CmdSource) => {
    let data = res.data;
    if (data instanceof ArrayBuffer) {
      data = Buffer.from(data).toString();
    } else if (typeof data !== 'string') {
      try {
        data = JSON.stringify(data);
      } catch (e) {
        data = data.toString();
      }
    }
    let texts = data.split('\n');
    texts = handleTexts(texts, source);
    return {texts};
  },
  html: (res: HTTP.Response, source: CmdSource) => {
    let data = res.data;
    if (data instanceof ArrayBuffer) {
      data = Buffer.from(data).toString();
    }
    const root = parse(data);
    let texts = Array.from(root.querySelectorAll(source.jquerySelector ?? 'p'))
      .map(e => source.attribute ? e.getAttribute(source.attribute) : e.structuredText);
    texts = handleTexts(texts, source);
    return {texts};
  },
  resource: (res: HTTP.Response) => {
    return {
      texts: [`data:${res.headers.get('Content-Type')};base64,` + Buffer.from(res.data).toString('base64')]
    };
  },
  plain: (res: HTTP.Response) => {
    let data = res.data;
    if (data instanceof ArrayBuffer) {
      data = Buffer.from(data).toString();
    }
    return {
      json: typeof data === 'string' ? JSON.parse(data) : data
    }
  },
}

export function cmdResData(source: CmdSource, res: HTTP.Response): ResData {
  const parser = baseProcessorMap[source.dataType];
  if (!parser) {
    throw new Error(`未知的資料返回型別: ${source.dataType}`);
  }
  return parser(res, source);
}
