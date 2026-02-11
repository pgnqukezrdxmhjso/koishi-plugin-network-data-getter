import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";

let fileType: typeof import("file-type");
async function getFileType() {
  if (!fileType) {
    fileType = await import("file-type");
  }
  return fileType;
}

const Files = {
  async getFileHashName(blob: Blob) {
    const fileType = await (await getFileType()).fileTypeFromBlob(blob);
    const hash = createHash("md5");
    await pipeline(blob.stream(), hash);
    const md5 = hash.digest("hex");
    return md5 + (fileType?.ext ? "." + fileType?.ext : "");
  },
};
export default Files;
