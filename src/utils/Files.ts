import path from "node:path";
import {tmpdir} from "node:os";
import {createHash, randomUUID} from "node:crypto";
import fs, {createReadStream} from "node:fs";
import {access, rename} from "node:fs/promises";
import {pipeline} from "node:stream/promises";

import Strings from "./Strings";
import LoadFileType from "./LoadFileType.js";


const Files = {
  async tmpFile() {
    let tmpFilePath: string;
    do {
      tmpFilePath = path.join(tmpdir(), randomUUID().replace(/-/g, ''));
      try {
        await access(tmpFilePath, fs.constants.F_OK);
      } catch (e) {
        break;
      }
    } while (1);
    return tmpFilePath;
  },
  async tmpFileMoveBeautifyName(tmpFilePath: string, fileName: string): Promise<string> {
    let newName: string;
    if (Strings.isNotBlank(fileName)) {
      newName = path.join(path.parse(tmpFilePath).dir, fileName);
      await rename(tmpFilePath, newName);
      return newName;
    }
    let readStream = createReadStream(tmpFilePath);
    const fileType = await (await LoadFileType()).fileTypeFromStream(readStream as any);
    readStream.destroy();
    if (!fileType) {
      return tmpFilePath;
    }
    newName = path.join(path.parse(tmpFilePath).dir, await Files.fileMd5(tmpFilePath) + '.' + fileType.ext);
    await rename(tmpFilePath, newName);
    return newName;
  },
  async fileMd5(filePath: string) {
    let readStream = createReadStream(filePath);
    const hash = createHash('md5');
    await pipeline(readStream, hash);
    return hash.digest('hex');
  },
  async getFileNameByBlob(blob: Blob) {
    const fileType = await (await LoadFileType()).fileTypeFromBlob(blob);
    const hash = createHash('md5');
    await pipeline(blob.stream(), hash);
    const md5 = hash.digest('hex');
    return md5 + '.' + (fileType?.ext || '')
  }
}
export default Files;
