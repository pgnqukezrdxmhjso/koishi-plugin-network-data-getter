import {Fragment, h} from "koishi";
import {render} from 'ejs'

import {buildInternalFns, CmdCtx, formatOption} from "./Core";
import {RendererType} from "./Config";
import Strings from "./utils/Strings";
import {ResData} from "./CmdResData";
import {urlToBase64} from "./Http";
import {logger} from "./logger";


interface Renderer {
  verify?: (s: string) => boolean;
  build: (args: CmdCtx & {
    resData: ResData;
  }) => Promise<Fragment>;
}

function buildMedia(type: string,) {
  return async (args: CmdCtx & {
    resData: ResData;
  }) => {
    const {resData, source} = args;
    if (!resData.texts) {
      throw '沒有符合條件的結果';
    }
    const elements = [];

    for (let text of resData.texts) {
      if ((source.expertMode && !source.expert.renderedMediaUrlToBase64)
        || !text?.startsWith?.('http')
      ) {
        elements.push(text);
      } else {
        elements.push(
          await urlToBase64({
            ...args,
            url: text,
            reqConfig: {
              headers: source.expertMode ? source.expert.rendererRequestHeaders : undefined
            }
          })
        );
      }
    }

    return h.parse(elements.map(text => h[type](text)).join(''));
  }
}

export const rendererMap: { [key in RendererType]: Renderer } = {
  text: {
    build: async ({resData}) => {
      if (!resData.texts) {
        return JSON.stringify(resData.json);
      }
      return h.parse(resData.texts.map(text => `<p>${text}</p>`).join(''));
    }
  },
  image: {
    verify: (s: string) => s.startsWith('http') || s.startsWith('data:image/'),
    build: buildMedia('img')
  },
  audio: {
    verify: (s: string) => s.startsWith('http') || s.startsWith('data:audio/'),
    build: buildMedia('audio')
  },
  video: {
    verify: (s: string) => s.startsWith('http') || s.startsWith('data:video/'),
    build: buildMedia('video')
  },
  file: {
    verify: (s: string) => s.startsWith('http') || s.startsWith('data:'),
    build: buildMedia('file')
  },
  ejs: {
    build: async (args) => {
      const {resData, source, presetPool, session, optionInfoMap} = args;
      try {
        const data = resData.json ?? resData.texts;
        if (!source.ejsTemplate) {
          return JSON.stringify(data);
        }
        const iFns = buildInternalFns(args);
        let code = await render(source.ejsTemplate, {
          $e: session.event,
          data,
          ...iFns.fns,
          ...(presetPool.presetConstantPool ?? {}),
          ...(presetPool.presetFnPool ?? {}),
          ...(optionInfoMap.map ?? {}),
          $data: data,
        }, {
          async: true,
          rmWhitespace: true
        });
        code = code.replace(/\n\n/g, '\n');
        return code;
      } catch (err) {
        logger.error('Error while parsing ejs data and json:');
        logger.error(err);
        throw err;
      }
    }
  },
  cmdLink: {
    build: async (args) => {
      if (Strings.isBlank(args.source.cmdLink)) {
        return null;
      }
      const cmdLink = await formatOption({
        ...args,
        content: args.source.cmdLink,
        data: args.resData.json ?? args.resData.texts
      });
      await args.session.execute(cmdLink);
      return null;
    }
  }
}

function handleMsgPacking(args: CmdCtx, fragment: Fragment): Fragment {
  if (!fragment) {
    return fragment;
  }
  const {config, source} = args;
  let msgPackingType = source.messagePackingType || config.messagePackingType;
  if (msgPackingType === 'inherit') {
    msgPackingType = config.messagePackingType;
  }
  if (!msgPackingType || msgPackingType === 'none') {
    return fragment;
  }
  if (!(fragment instanceof Array)) {
    fragment = [fragment];
  }
  if (msgPackingType === 'multiple' && fragment.length < 2) {
    return fragment;
  }

  const forward = h.parse('<message forward></message>');
  forward[0].children = fragment.map(f => {
    if (typeof f === 'string') {
      return h.parse(`<message>${f}</message>`)[0];
    }
    const message = h.parse(`<message></message>`)[0];
    message.children = f instanceof Array ? f : [f];
    return message;
  });
  return forward;
}

export async function rendered(args: CmdCtx & {
  resData: ResData,
}) {
  const {source} = args;
  const renderer = rendererMap[source.sendType]
  if (!renderer) {
    throw (`不支援的渲染型別: ${source.sendType}`);
  }
  return handleMsgPacking(args, await renderer.build(args));
}
