const OTPAuth = require('otpauth');
const crypto = require('node:crypto');
const {HTTP} = require("@koishijs/plugin-http");
/**
 *
 * @type {HTTP}
 */
const http = HTTP;
const generatePresetFns = [
  function encryptContent(algorithm = 'aes-128-cbc', content, key, iv) {
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  },
  function generateTOTP(secret) {
    return new OTPAuth.TOTP({secret}).generate();
  },
  async function getUrl(url) {
    return await http.get(url);
  }
]

module.exports = function () {
  return generatePresetFns.map(presetFn => {
    let fn = presetFn.toString().trim();
    let async = false;
    if (fn.startsWith('async ')) {
      async = true;
      fn = fn.replace(/^async\s+/, '')
    }
    const name = fn.replace(/^function\s+([^(]+)[\s\S]*/, '$1');
    const args = fn.replace(/^function[^()]+\(([^)]*)\)[\s\S]*/, '$1');
    const body = fn.replace(/^function[^{]+\{([\s\S]*)}\s*/, '$1').trim().replace(/([\r\n]) {4}/g, '$1');
    return {async, name, args, body};
  });
}
