# koishi-plugin-network-data-getter

[![npm](https://img.shields.io/npm/v/koishi-plugin-network-data-getter?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-network-data-getter)

透過多行文字連結隨機抽出一條作為圖片或文案傳送，支援自定義指令


## 功能介紹

目前支援的資料解析型別:

- JSON
- 多行文字
- 資源 (圖片/影片/音訊等)
- HTML
- 源資料

目前支援的傳送型別:

- 圖片
- 文字
- EJS模板
- 音訊
- 影片
- 文件

目前支援透過指令傳遞引數:

- 以 `<%=$0%>` `<%=$1%>` `<%=$2%>` 傳入...

- 透過設定 引數配置 選項配置

## 一般例子

**假設你需要傳輸指令引數到你的連結**

你可以使用 `<%=$0%>` `<%=$1%>` 等等的方式來傳遞引數, 例如:

```url
https://google.com/search?q=<%=$0%>
```

當你的指令為 `google hello` 時，插件會將 `<%=$0%>` 替換為 `hello`，併傳送到 `https://google.com/search?q=hello`。

另外也支援多個引數，例如:

```url
https://google.com/search?q=<%=$0%>&safe=<%=$1%>
```

當你的指令為 `google hello true` 時，插件會將 `<%=$0%>` 替換為 `hello`，`<%=$1%>` 替換為 `true`，併傳送到 `https://google.com/search?q=hello&safe=true`。

---

**假設你需要透過 payload 傳輸引數到你的連結**

payload一般用在POST，PUT等請求，你可以在設定中新增 `request_data` 資料，例如:

```yml
request_data: '{"name": "<%=$0%>", "age": "<%=$1%>"}'
request_json: true
```

__注意: 假設你的資料為JSON，則必須設定 `request_json` 為 `true`__

---

**假設你的連結返回多行文字**，例如

```txt
今天禮拜四，V我50
今天是瘋狂星期四！！
```

則選擇傳送型別為`文字`, 資料返回型別為`多行文字`, 插件便會從這兩句文案中隨機抽選一個返回。

---

**假設你的連結返回多行圖片連結**，例如

```txt
https://cdn.xyz/abc.jpg
https://cdn.xyz/xyz.jpg
```

則選擇傳送型別為`圖片`, 資料返回型別為`多行文字`, 插件便會從這兩條圖片連結隨機抽選一張圖片返回。

---

**假設你的連結返回隨機圖片**

則選擇傳送型別為`圖片`, 資料返回型別為`資源`, 插件則會直接把該連結返回的圖片直接傳送。

此型別適用於所有資源，包括影片，音訊，文件等。

## 額外的解析型別選項 + 例子

### HTML

透過 Jquery 提取文字，設定如下

```yml
jquery_selector: 提取元素, 相當於 querySelectorAll(value)
attribute: 獲取元素屬性, 相當於 getAttribute(value)
```

例子如下:

```html
<img class="abc" src="https://cdn.xyz/abc1.img">
<img class="abc" src="https://cdn.xyz/abc2.img">
<img class="abc" src="https://cdn.xyz/abc3.img">
<img class="xyz" src="https://cdn.xyz/xyz.img">
```

想獲取僅限 class 中包含 `abc` 的圖片連結，則可用:

```yml
jquery_selector: .abc
attribute: src
```

插件則會從該三張圖片中隨機抽選。

__注意: 提取的 html 文字為 http 請求的文字，不包含js後期注入的html元素__

### JSON

透過字元進行JSON取值，設定如下

```yml
json_key: 需要掃描的key, 相當於在js中獲取json數值時的引用 + 支援迭代邏輯 []
```

例子如下:

```json
[
    {
        "id": "_5degoesxi",
        "question": "What would you like to practice today?",
        "possible_answers": [
            {
                "label": "HTML & CSS",
                "action": {
                    "key": "lesson_category",
                    "type": "html-css"
                }
            },
            {
                "label": "General Typing",
                "action": {
                    "key": "lesson_category",
                    "type": "general"
                }
            }
        ]
    },
    {
        "id": "_zvcr8k6sq",
        "question": "Choose your difficult level.",
        "possible_answers": [
            {
                "label": "Easy",
                "action": {
                    "key": "difficulty",
                    "type": "easy"
                }
            },
            {
                "label": "Medium",
                "action": {
                    "key": "difficulty",
                    "type": "medium"
                }
            },
            {
                "label": "Hard",
                "action": {
                    "key": "difficulty",
                    "type": "hard"
                }
            }
        ]
    }
]
```

若想獲取所有元素中內 action 的 type, 則使用

```yml
json_key: "[].possible_answers[].action.type"
```

`[]` 代表迭代，會提取每個迭代元素的值。
提取後將會從 `hard`, `medium`, `easy`, `general`, `html-css` 中隨機抽選。

---

若 JSON 從 object 而非 array 開始，則直接填入該 object 的 key 即可，例如:

```json
{
    "abc": {
        "xyz": ["foo", "bar"]
    }
}
```

則填入:

```yml
json_key: "abc.xyz"
```

就可獲得 `foo`, `bar` 的隨機抽選。

__注意: 若 `json_key` 填寫不當有可能會導致插件報錯。__

### EJS

資料型別選擇``後設資料``，填入``EJS模板``即可。

假設你的返回資料為以下的json:

```json
{
    "name": "morpheus",
    "job": "leader",
    "id": "583",
    "createdAt": "2023-11-13T06:30:39.982Z"
}
```

EJS模板則可輸入:

```yml
ejs_template: |-
    <p> 成功建立 name: <%= data.name %>, job: <%= data.job %></p>
    <p> id: <%= data.id %> </p>
```

插件將會根據模板輸出迴應。


---
# VersionHistory

### TODO

* 新增全域性變數池功能(或許是直接用快取服務
* 增加資料處理器功能替代原本的資料返回型別額外配置
* 隨機功能修改為資料處理器的選項
* 傳送型別修改為渲染型別
* 渲染型別預設傳送基礎型別
* 渲染型別 `EJS 模板` 支援預設函式、預設常量、請求引數
* 增加 `渲染模板系列` `Open Graph Protocol` `rss` `指令鏈` 渲染型別
* 渲染模板系列 `svg` `psd` `htmlCode` `htmlUrl`
* 渲染網路代理
* 下載資源時的自定義headers
* 下載資源時自動設定Referer頭
* 使用請求結果中的url資料傳送資源時，下載url後轉base64傳送
* 增加定時執行指令功能（計劃任務、間隔）
* 定時執行指令功能，先使用head請求判斷差異

### 0.1.29

* 去除axios

### 0.1.23

* 預設函式支援非同步
* 預設函式新增http
* 預設函式預設值增加 `getUrl`

### 0.1.22

* 增加匿名資料統計

### 0.1.21

* 載入頻道型別引數頻道資料
* 增加2個預設的預設函式

### 0.1.19

* 載入用戶型別引數用戶資料

### 0.1.18

* 支援可重用

### 0.1.15

* 最佳化平臺資原始檔名與字尾獲取
* 最佳化平臺資原檔名解析
* 最佳化平臺資原下載

### 0.1.13

* 最佳化解析回覆

### 0.1.12

* 平臺資源下載代理

### 0.1.11

* 添加 `用户` `頻道` 參數類型
* 下載消息中的資源時使用指令代理
* 解析回覆的中介軟體跳過無關指令

### 0.1.9

* 修復解析回覆的bug

### 0.1.7

* 解析回覆

### 0.1.6

* 新增對獲取中提示狀態取反選項
* 預設函式可使用的模組新增TOTP
* 預設資料型別修改為 `無`
* 修復函式執行bug

### 0.1.5

* 修復ejs傳送型別的bug

### 0.1.3

* 新增預設常量功能

### 0.1.2

* 預設函式入參新增crypto
* {}取值替換為<%= %>
* 移除image資料返回型別

### 0.1.1

* 新增預設函式

### 0.1.0

* 新增引數配置、選項配置

### 0.0.15

* 新增'無'資料型別
* 修改請求地址樣式為link

### 0.0.14

* 修復程式碼bug

### 0.0.12

* 新增請求資料型別 `form-data` `x-www-form-urlencoded` `raw`

### 0.0.11

* 使代理配置支援http協議的目標
* 配置結構調整

### 0.0.10

* 代理型別配置
* 配置欄位命名修改

### 0.0.9

* 新增請求代理
