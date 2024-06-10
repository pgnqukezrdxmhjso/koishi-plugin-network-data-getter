const OTPAuth = require('otpauth');
const crypto = require('node:crypto');

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
]

module.exports = function () {
  return generatePresetFns.map(presetFn => {
    const fn = presetFn.toString().trim();
    const name = fn.replace(/^function\s+([^(]+)[\s\S]*/, '$1');
    const args = fn.replace(/^function[^()]+\(([^)]*)\)[\s\S]*/, '$1');
    const body = fn.replace(/^function[^{]+\{([\s\S]*)}\s*/, '$1').trim().replace(/([\r\n]) {4}/g, '$1');
    return {name, args, body};
  });
}
