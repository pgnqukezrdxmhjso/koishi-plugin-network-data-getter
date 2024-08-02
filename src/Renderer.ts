import {Fragment, h, Random} from "koishi";
import {render} from 'ejs'

import {RendererType} from "./Config";
import {urlToBase64} from "./Http";
import {CmdCtx, formatOption} from "./Core";
import Strings from "./utils/Strings";
import {ResData} from "./CmdResData";
import {logger} from "./logger";


interface Renderer {
  isMedia?: boolean;
  verify?: (s: string) => boolean;
  build: (args: CmdCtx & {
    resData: ResData;
  }) => Promise<Fragment>;
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
    build: async (
      {resData, source, presetPool, session, optionInfoMap}
    ) => {
      try {
        const data = resData.json ?? resData.text ?? resData.texts;
        const {ejsTemplate} = source;
        if (ejsTemplate) {
          let code = await render(ejsTemplate, {
            $e: session.event,
            data,
            $data: data,
            ...(presetPool.presetConstantPool ?? {}),
            ...(presetPool.presetFnPool ?? {}),
            ...(optionInfoMap.map ?? {}),
          }, {
            async: true,
            rmWhitespace: true
          });
          code = code.replace(/\n\n/g, '\n');
          return code;
        } else {
          return JSON.stringify(data);
        }
      } catch (err) {
        logger.error('Error while parsing ejs data and json:');
        logger.error(err);
        throw err;
      }
    }
  },
  'cmdLink': {
    build: async (args) => {
      if (Strings.isBlank(args.source.cmdLink)) {
        return null;
      }
      const cmdLink = await formatOption({
        ...args,
        content: args.source.cmdLink,
        data: args.resData.json ?? args.resData.text ?? args.resData.texts
      });
      await args.session.execute(cmdLink);
      return null;
    }
  }
}


export async function rendered(args: CmdCtx & {
  resData: ResData,
}) {
  const {source, resData} = args;
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
  if (renderer.isMedia
    && (!source.expertMode || source.expert.renderedMediaUrlToBase64)
    && resData.text?.startsWith?.('http')
  ) {
    resData.text = await urlToBase64({
      ...args,
      isPlatform: false,
      url: resData.text,
      reqConfig: {
        headers: source.expertMode ? source.expert.rendererRequestHeaders : undefined
      }
    });
  }

  return await renderer.build(args);
}


