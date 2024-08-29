export default [
  {
    async: false,
    name: "encryptContent",
    args: "algorithm = 'aes-128-cbc', content, key, iv",
    body: `\
const cipher = crypto.createCipheriv(algorithm, key, iv);
let encrypted = cipher.update(content, 'utf8', 'hex');
encrypted += cipher.final('hex');
return encrypted;`,
  },
  {
    async: false,
    name: "generateTOTP",
    args: "secret",
    body: `return new OTPAuth.TOTP({secret}).generate();`,
  },
  {
    async: true,
    name: "getUrl",
    args: "url",
    body: `return await http.get(url)`,
  },
];
