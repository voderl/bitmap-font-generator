# bitmap-font-generator

Generate Chinese bitmap font (CJK) with lazy-loaded Unicode subsets for PixiJS.

暂时面向 PixiJS 的位图字体生成工具：把 TTF/OTF 拆成多个 Unicode 子集，生成可按需加载的 BitmapText，适合中文、日文、韩文等大字符集场景。

## Demo

[Go to Online Demo](https://voderl.cn/demo/bitmap-font-generator/index.html)

## Why

在大量文本场景下，PixiJS 的 `BitmapText` 通常比 `Text` 更适合长期驻留渲染，因为它能复用图集纹理，减少运行时排版和纹理生成的开销。

但传统位图字体有个明显问题：要先把整套字形全部生成并全部加载。对于 CJK 字体，这通常意味着几千到几万个字符，一次性加载不现实。

这个库的做法是：

- 构建时把字体拆成多个 Unicode 子集
- 每个子集单独生成 atlas PNG 和字形信息
- 运行时先加载 `manifest.json`
- 真正显示到页面上的字符，才去加载对应子集

这样同一套字体既保留了位图字体的渲染优势，也避免了首屏就下载整包大字体资源。

## 体积示例

以下数据来自仓库内的示例字体 `HYWenHei-55W.ttf`：

- 原始 TTF 文件约 `3.1 MB`
- 生成后的 atlas PNG 总计约 `2.47 MB`
- `manifest.json` 约 `681 KB`
- 单张 atlas 图片大多在 `10 KB` 到 `52 KB` 之间

重点不在于把“整套资源的总和”压到极致，而是在于运行时只按需加载少量子集图片。实际页面通常不会一次请求全部 atlas。

## 安装

```bash
npm install bitmap-font-generator
```

目前主要面向 `pixi.js >= 8.0.0`。(如果你有 `PixiJS v7` 的使用需求，可以提 issue，旧版本支持 v7)

## 用法

### 1. 构建阶段生成位图字体

```ts
import { bitmapFontGenerator } from 'bitmap-font-generator';

await bitmapFontGenerator({
  fontPath: './assets/MyFont.ttf',
  outputDir: './public/fonts/MyFont',
  fontName: 'MyFont',
  fontSize: 32,
  padding: 0,
  resolution: 2,
});
```

输出目录示例：

```text
public/fonts/MyFont/
  manifest.json
  MyFont_0.png
  MyFont_1.png
  ...
```

### 2. 在 PixiJS 中使用

```ts
import { BitmapFontManager, LazyBitmapText } from 'bitmap-font-generator/runtime';

await BitmapFontManager.loadFont('/fonts/MyFont/');

const text = new LazyBitmapText({
  text: '你好世界',
  style: {
    fontFamily: 'MyFont',
    fontSize: 24,
    fill: 0xffffff,
    letterSpacing: 2,
    align: 'center',
    wordWrap: true,
    breakWords: true,
    wordWrapWidth: 600,
  },
});

app.stage.addChild(text);

text.text = '新的内容';
```

`BitmapFontManager.loadFont()` 会先加载 `manifest.json`，并立即注册一个空的 `BitmapFont`。这样 `LazyBitmapText` 在真实子集尚未下载完成时，也能先用占位字符稳定渲染。

`LazyBitmapText` 尽量保持和 PixiJS `BitmapText` 一致的构造方式，常见的 `anchor`、`x`、`y`、`rotation`、`alpha`、`roundPixels` 等字段都可以直接传入。额外限制只有一个：`style.fontFamily` 必须是单个字符串。

### 3. 预加载指定文本

```ts
await BitmapFontManager.load('MyFont', '关键文字');
```

如果你希望文本在首次展示前就已经准备好对应字形，可以先手动调用这一步。

## API

### `bitmapFontGenerator(options): Promise<FontManifest>`

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `fontPath` | `string` | 必填 | TTF/OTF 文件路径 |
| `outputDir` | `string` | 必填 | 输出目录 |
| `fontName` | `string` | 取字体元数据 | 输出到 manifest 中的字体名 |
| `fontSize` | `number` | `32` | 逻辑字号，单位 px |
| `pageSize` | `number` | `2048` | 图集最大边长，实际会自动选择 128/256/512/1024/2048 |
| `padding` | `number` | `0` | 字符四周留白 |
| `resolution` | `number` | `1` | 分辨率倍率，适合 HiDPI 输出 |

### `BitmapFontManager`

| 方法 | 说明 |
|---|---|
| `.loadFont(dir)` | 加载字体目录下的 `manifest.json`，并注册空的位图字体 |
| `.load(fontName, text)` | 确保这段文本需要的字符子集已加载 |
| `.isCharLoaded(fontName, cp)` | 判断某个 code point 对应子集是否已加载 |
| `.getCharAdvance(fontName, cp)` | 获取字符 advance 宽度 |
| `.subscribe(fontName, cb)` | 订阅字体更新事件，返回取消订阅函数 |

### `LazyBitmapText`

它是一个面向运行时懒加载的 `BitmapText` 替代实现，接受与 PixiJS `BitmapText` 接近的 `TextOptions` 结构。

| 字段 | 类型 | 说明 |
|---|---|---|
| `text` | `string` | 文本内容 |
| `style.fontFamily` | `string` | 已注册的位图字体名 |
| `style.fontSize` | `number` | 显示字号 |
| `style.fill` | `number \| string` | 文本颜色 |
| `style.letterSpacing` | `number` | 字间距 |
| `style.align` | `string` | `'left'` / `'center'` / `'right'` / `'justify'` |
| `style.wordWrapWidth` | `number` | 自动换行宽度 |
| `anchor`, `x`, `y`, `rotation` 等 | PixiJS 字段 | 直接透传 |

## 工作原理

```text
构建阶段（Node.js）                    运行时（Browser）
┌─────────────────────┐               ┌──────────────────────────┐
│ TTF/OTF 字体        │               │ loadFont('/fonts/MyFont/')│
│   ↓                 │               │   ↓ 读取 manifest.json   │
│ 拆成多个 Unicode 子集│  manifest.json│   ↓ 注册空 BitmapFont    │
│   ↓                 │ ───────────→  │                          │
│ 渲染 atlas PNG      │   subset PNGs │ new LazyBitmapText(...)  │
│   ↓                 │ ──按需加载──→ │   ↓ 先显示占位字符       │
│ 写出 manifest.json  │               │   ↓ 加载所需子集         │
└─────────────────────┘               │   ↓ 用真实字形替换       │
                                      └──────────────────────────┘
```

## 开发

```bash
npm run build      # 构建 src/ 和 runtime/ 到 dist/
npm run dev        # 监听模式
npm run generate   # 生成测试字体资源
npm run web        # 启动 demo 和 benchmark 的本地开发服务
npm run web:build  # 构建 demo 页面到 test/web/dist/
```

## 许可协议

MIT
