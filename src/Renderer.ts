import {Context, Fragment, h, HTTP, Random, Session} from "koishi";
import {render} from 'ejs'

import {CmdSource, Config, RendererType, SourceExpert} from "./Config";
import {getCmdHttpClient} from "./CmdReq";
import {formatObjOption, formatOption, OptionInfoMap, PresetPool} from "./Core";
import Strings from "./utils/Strings";
import {ResData} from "./CmdResData";
import Objects from "./utils/Objects";
import {logger} from "./logger";


interface Renderer {
  isMedia?: boolean;
  verify?: (s: string) => boolean;
  build: (arg: {
    resData: ResData;
    source: CmdSource;
    presetPool: PresetPool;
    session: Session;
    optionInfoMap: OptionInfoMap;
  }) => Promise<Fragment>;
}


async function mediaUrlToBase64({ctx, config, source, presetPool, session, optionInfoMap, url}: {
  ctx: Context,
  config: Config,
  source: CmdSource,
  presetPool: PresetPool,
  session: Session,
  optionInfoMap: OptionInfoMap,
  url: string,
}) {
  const expert: SourceExpert = source.expertMode ? source.expert : {renderedMediaUrlToBase64: true} as any;
  if (!expert.renderedMediaUrlToBase64) {
    return;
  }

  const reqConfig: HTTP.RequestConfig = {
    headers: {
      Referer: new URL(url).origin
    }
  };
  if (Objects.isNotEmpty(expert.rendererRequestHeaders)) {
    reqConfig.headers = {...reqConfig.headers, ...expert.rendererRequestHeaders};
    await formatObjOption({
      obj: reqConfig.headers,
      optionInfoMap, session, compelString: true, presetPool
    });
  }
  const httpClient = getCmdHttpClient({ctx, config, source});
  const res = await httpClient('get', url, reqConfig);
  return `data:${res.headers.get('Content-Type')};base64,` + Buffer.from(res.data).toString('base64');
}

const rendererMap: { [key in RendererType]: Renderer } = {
  'text': {
    verify: (s: string) => s.length > 0,
    build: async ({resData}) => resData.text
  },

  'image': {
    isMedia: true,
    verify: (s: string) => s.startsWith('http') || s.startsWith('data:image/'),
    build: async ({resData}) => h.img(resData.text)
  },

  'audio': {
    isMedia: true,
    verify: (s: string) => s.startsWith('http') || s.startsWith('data:audio/'),
    build: async ({resData}) => h.audio(resData.text)
  },

  'video': {
    isMedia: true,
    verify: (s: string) => s.startsWith('http') || s.startsWith('data:video/'),
    build: async ({resData}) => h.video(resData.text)
  },

  'file': {
    isMedia: true,
    verify: (s: string) => s.startsWith('http') || s.startsWith('data:'),
    build: async ({resData}) => h.file(resData.text)
  },

  'ejs': {
    build: async ({resData, source}) => {
      try {
        const data = resData.json;
        const {ejsTemplate} = source;
        if (ejsTemplate) {
          return render(ejsTemplate, {data})
        } else {
          return JSON.stringify(data)
        }
      } catch (err) {
        logger.error('Error while parsing ejs data and json:')
        logger.error(err)
        throw err
      }
    }
  },
  'cmdLink': {
    build: async (
      {resData, source, presetPool, session, optionInfoMap}
    ) => {
      if (Strings.isBlank(source.cmdLink)) {
        return null;
      }
      const cmdLink = await formatOption({
        content: source.cmdLink, presetPool, session, optionInfoMap,
        data: resData.json ?? resData.text ?? resData.texts
      });
      await session.execute(cmdLink);
      return null;
    }
  }
}


export async function rendered({ctx, config, source, presetPool, session, optionInfoMap, resData}: {
  ctx: Context,
  config: Config,
  source: CmdSource,
  presetPool: PresetPool,
  session: Session,
  optionInfoMap: OptionInfoMap,
  resData: ResData,
}) {
  const renderer = rendererMap[source.sendType]
  if (!renderer) {
    throw (`不支援的渲染型別: ${source.sendType}`);
  }
  if (resData.texts) {
    const selected = Random.pick(
      !renderer.verify ? resData.texts : resData.texts.filter(s => renderer.verify(s))
    );
    if (Strings.isEmpty(selected)) {
      throw ('沒有符合條件的結果');
    }
    resData.text = selected;
  }
  if (renderer.isMedia && resData.text?.startsWith?.('http')) {
    const base64 = await mediaUrlToBase64({
      ctx, config, source, presetPool, session, optionInfoMap, url: resData.text
    });
    if (base64) {
      resData.text = base64;
    }
  }

  return await renderer.build({resData, source, presetPool, session, optionInfoMap});
}


