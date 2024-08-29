import packageJson from "../package.json";
import { Logger } from "koishi";
import { CmdCtx } from "./Core";

export const logger = new Logger(packageJson.name);

export function debugInfo(cmdCtx: CmdCtx, content: string | (() => string)) {
  if (!cmdCtx.config.expertMode || !cmdCtx.config.expert.showDebugInfo) {
    return;
  }
  logger.info(typeof content === "string" ? content : content());
}
