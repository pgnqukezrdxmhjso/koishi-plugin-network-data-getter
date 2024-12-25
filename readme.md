# koishi-plugin-network-data-getter

[![npm](https://img.shields.io/npm/v/koishi-plugin-network-data-getter?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-network-data-getter)

透過多行文字連結隨機抽出一條作為圖片或文案傳送，支援自定義指令

## 功能介紹

目前支援的資料解析型別:

- JSON
- 多行文字
- 資源 (圖片/影片/音訊等)
- HTML
- JSONRaw

目前支援的渲染型別:

- 文字
- 圖片
- 音訊
- 影片
- 檔案
- EJS模板

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

當你的指令為 `google hello true` 時，插件會將 `<%=$0%>` 替換為 `hello`，`<%=$1%>` 替換為 `true`
，併傳送到 `https://google.com/search?q=hello&safe=true`。

---

**假設你需要透過 payload 傳輸引數到你的連結**

payload一般用在POST，PUT等請求，你可以在設定中新增 `requestRaw` 資料，例如:

```yml
requestRaw: '{"name": "<%=$0%>", "age": "<%=$1%>"}'
requestJson: true
```

**注意: 假設你的資料為JSON，則必須設定 `requestJson` 為 `true`**

---

**假設你的連結返回多行文字**，例如

```txt
今天禮拜四，V我50
今天是瘋狂星期四！！
```

則選擇渲染型別為`文字`, 資料返回型別為`多行文字`, 插件便會從這兩句文案中隨機抽選一個返回。

---

**假設你的連結返回多行圖片連結**，例如

```txt
https://cdn.xyz/abc.jpg
https://cdn.xyz/xyz.jpg
```

則選擇渲染型別為`圖片`, 資料返回型別為`多行文字`, 插件便會從這兩條圖片連結隨機抽選一張圖片返回。

---

**假設你的連結返回隨機圖片**

則選擇渲染型別為`圖片`, 資料返回型別為`資源`, 插件則會直接把該連結返回的圖片直接傳送。

此型別適用於所有資源，包括影片，音訊，文件等。

## 額外的解析型別選項 + 例子

### HTML

透過 Jquery 提取文字，設定如下

```yml
jquerySelector: 提取元素, 相當於 querySelectorAll(value)
attribute: 獲取元素屬性, 相當於 getAttribute(value)
```

例子如下:

```html
<img class="abc" src="https://cdn.xyz/abc1.img" alt="" />
<img class="abc" src="https://cdn.xyz/abc2.img" alt="" />
<img class="abc" src="https://cdn.xyz/abc3.img" alt="" />
<img class="xyz" src="https://cdn.xyz/xyz.img" alt="" />
```

想獲取僅限 class 中包含 `abc` 的圖片連結，則可用:

```yml
jquerySelector: .abc
attribute: src
```

插件則會從該三張圖片中隨機抽選。

**注意: 提取的 html 文字為 http 請求的文字，不包含js後期注入的html元素**

### JSON

透過字元進行JSON取值，設定如下

```yml
jsonKey: 需要掃描的key, 相當於在js中獲取json數值時的引用 + 支援迭代邏輯 []
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
jsonKey: "[].possible_answers[].action.type"
```

`[]` 代表迭代，會提取每個迭代元素的值。
提取後將會從 `hard`, `medium`, `easy`, `general`, `html-css` 中隨機抽選。

---

若 JSON 從 object 而非 array 開始，則直接填入該 object 的 key 即可，例如:

```json
{
  "abc": {
    "xyz": [
      "foo",
      "bar"
    ]
  }
}
```

則填入:

```yml
jsonKey: "abc.xyz"
```

就可獲得 `foo`, `bar` 的隨機抽選。

**注意: 若 `jsonKey` 填寫不當有可能會導致插件報錯。**

### EJS

資料型別選擇`JSONRaw`，填入`EJS模板`即可。

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
ejsTemplate: |-
  <p> 成功建立 name: <%= $data.name %>, job: <%= $data.job %></p>
  <p> id: <%= $data.id %> </p>
```

插件將會根據模板輸出迴應。

---

# VersionHistory

### TODO

- 增加 `渲染模板系列` `Open Graph Protocol` `rss` 渲染型別
- 渲染模板系列 `svg` `psd`
- 渲染網路代理
- 支援處理動態網頁
- 自動回填預設的配置
- 線上分享配置頁面

### 0.2.11

- 新增呼叫輸出日誌功能
- 無變化的響應不會傳送訊息 增加選項 由使用者發起的指令不進行判斷
- 新增指令選項 不執行由使用者發起的指令
- 新增基礎選項 指令分組
- 預設函式新增 資料快取服務 輸出日誌

### 0.2.10

- 增加 無變化的響應不會傳送訊息 選項
- 配置頁面導航小工具 增加切換到上下個配置、高亮當前配置

### 0.2.8

- html截圖 增加註入指令引數功能

### 0.2.7

- 修復bug

### 0.2.6

- 增加 渲染型別 html截圖

### 0.2.5

- 指令鏈增加多行指令

### 0.2.3

- 增加鉤子函式功能

### 0.2.2

- 為支援鉤子函式功能調整程式碼

### 0.2.1

- 新增呼叫資料快取服務功能

### 0.2.0

- 增加定時執行指令功能
- 程式碼結構調整

### 0.1.69

- 資料返回型別改名為響應資料處理器
- 新增 響應資料處理器-自定義函式
- pickOneRandomly配置項的邏輯移動到渲染器中

### 0.1.68

- 傳送模式-主題推送 指令自動新增訂閱主題選項

### 0.1.67

- 增加消息發送模式-主題推送

### 0.1.66

- 增加http報錯處理方式配置

### 0.1.65

- umami-statistics-service

### 0.1.61

- 最佳化請求失敗日誌

### 0.1.59

- showDebugInfo

### 0.1.58

- Umami域名替換

### 0.1.57

- 通過轉發發送內容的選項

### 0.1.56

- 隨機功能修改為資料處理器的選項
- 資源類渲染型別，支援傳送多條資源

### 0.1.55

- 增加內建函式 `$urlToString` `$urlToBase64`

### 0.1.53

- 修復2個bug

### 0.1.52

- 修復bug

### 0.1.51

- 修復bug

### 0.1.50

- 修復bug

### 0.1.39

- 引數和選項增加長文字型別

### 0.1.38

- 修復預設函式預設值bug

### 0.1.37

- 渲染型別 `EJS 模板` 支援預設函式、預設常量、請求引數

### 0.1.36

- 增加 `指令鏈` 渲染型別

### 0.1.35

- 指令配置快速導航

### 0.1.33

- 傳送型別修改為渲染型別
- 渲染型別為資源類時，下載url後轉base64的選項
- 渲染資源類,下載時自動設定`Referer`頭
- 渲染資源類,下載時的自定義headers

### 0.1.32

- 資源資料返回型別資料處理最佳化
- 平臺資源下載配置增加請求頭

### 0.1.31

- 修復去除axios後導致的JSONRaw型別解析bug

### 0.1.29

- 去除axios

### 0.1.23

- 預設函式支援非同步
- 預設函式新增http
- 預設函式預設值增加 `getUrl`

### 0.1.22

- 增加匿名資料統計

### 0.1.21

- 載入頻道型別引數頻道資料
- 增加2個預設的預設函式

### 0.1.19

- 載入用戶型別引數用戶資料

### 0.1.18

- 支援可重用

### 0.1.15

- 最佳化平臺資原始檔名與字尾獲取
- 最佳化平臺資原檔名解析
- 最佳化平臺資原下載

### 0.1.13

- 最佳化解析回覆

### 0.1.12

- 平臺資源下載代理

### 0.1.11

- 添加 `用户` `頻道` 參數類型
- 下載消息中的資源時使用指令代理
- 解析回覆的中介軟體跳過無關指令

### 0.1.9

- 修復解析回覆的bug

### 0.1.7

- 解析回覆

### 0.1.6

- 新增對獲取中提示狀態取反選項
- 預設函式可使用的模組新增TOTP
- 預設資料型別修改為 `無`
- 修復函式執行bug

### 0.1.5

- 修復ejs傳送型別的bug

### 0.1.3

- 新增預設常量功能

### 0.1.2

- 預設函式入參新增crypto
- {}取值替換為<%= %>
- 移除image資料返回型別

### 0.1.1

- 新增預設函式

### 0.1.0

- 新增引數配置、選項配置

### 0.0.15

- 新增'無'資料型別
- 修改請求地址樣式為link

### 0.0.14

- 修復程式碼bug

### 0.0.12

- 新增請求資料型別 `form-data` `x-www-form-urlencoded` `raw`

### 0.0.11

- 使代理配置支援http協議的目標
- 配置結構調整

### 0.0.10

- 代理型別配置
- 配置欄位命名修改

### 0.0.9

- 新增請求代理
