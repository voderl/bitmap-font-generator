# bitmap-font-generator

Generate bitmap font sprite sheets from TTF/OTF fonts for PixiJS, with **lazy subset loading** for optimal web delivery.

## Why

PixiJS `BitmapText` renders significantly faster than `Text` at scale — one draw call per shared atlas vs. per-character layout. But traditional bitmap fonts require loading **all** glyphs upfront, which is impractical for CJK fonts with 20,000+ characters.

This library solves the problem by splitting fonts into ~66 Unicode subsets and loading them **on demand**. A page displaying "你好世界" loads only 1-2 subsets (~500KB), not the full 50MB atlas.

## Performance Advantages

- **Lazy subset loading** — only download glyphs that are actually displayed
- **Zero layout shift** — unloaded characters render as dot placeholders with correct advance widths; layout never jumps when real glyphs arrive
- **O(n) incremental updates** — new subsets add only their own chars to the BitmapFont, not rebuild everything
- **Smart subscription** — each `LazyBitmapText` auto-unsubscribes once all its characters are loaded, so idle instances have zero overhead
- **Compressed PNGs** — palette mode (4 colors) + zlib shrinks atlas pages to ~300-500KB each
- **HiDPI support** — generate at 2x resolution for Retina displays, runtime scaling handled automatically

## Install

```bash
npm install bitmap-font-generator
```

Peer dependency: `pixi.js >= 8.0.0` (optional, only needed for runtime)

## Usage

### 1. Generate bitmap font (Node.js, build time)

```ts
import { bitmapFontGenerator } from 'bitmap-font-generator';

await bitmapFontGenerator({
  fontPath: './assets/MyFont.ttf',
  outputDir: './public/fonts/MyFont',
  fontName: 'MyFont',
  fontSize: 32,       // logical size in px
  pageSize: 1024,     // atlas page size
  padding: 1,         // glyph padding
  resolution: 2,      // 2x for HiDPI
  pngCompression: 9,  // zlib level 0-9
});
```

Output:
```
public/fonts/MyFont/
  manifest.json            # char metrics + subset index
  MyFont_0_0.png           # subset 0, page 0
  MyFont_1_0.png           # subset 1, page 0
  MyFont_1_1.png           # subset 1, page 1
  ...
```

### 2. Use in PixiJS (browser, runtime)

```ts
import { BitmapFontManager, LazyBitmapText } from 'bitmap-font-generator/runtime';

// Load manifest (registers an empty BitmapFont immediately)
await BitmapFontManager.loadFont('/fonts/MyFont/');

// Create text — subsets load automatically in background
const text = new LazyBitmapText('你好世界', {
  fontName: 'MyFont',
  fontSize: 24,
  tint: 0xffffff,
  letterSpacing: 2,
  align: 'center',
  maxWidth: 600,  // enables word wrap
});
app.stage.addChild(text);

// Update text — new subsets load on demand
text.text = '新的内容';
```

`LazyBitmapText` extends `BitmapText`, so all PixiJS properties work natively: `anchor`, `scale`, `rotation`, `alpha`, etc.

### 3. Preload specific text (optional)

```ts
// Ensure characters are ready before display
await BitmapFontManager.load('MyFont', '关键文字');
```

## API

### Generator (Node.js)

#### `bitmapFontGenerator(options): Promise<FontManifest>`

| Option | Type | Default | Description |
|---|---|---|---|
| `fontPath` | `string` | required | Path to TTF/OTF file |
| `outputDir` | `string` | required | Output directory |
| `fontName` | `string` | from font metadata | Font family name |
| `fontSize` | `number` | `32` | Logical font size in px |
| `pageSize` | `number` | `1024` | Atlas page dimensions |
| `padding` | `number` | `1` | Glyph padding in px |
| `resolution` | `number` | `1` | Resolution multiplier (2 for HiDPI) |
| `pngCompression` | `number` | `9` | PNG zlib compression level (0-9) |

### Runtime (Browser)

#### `BitmapFontManager`

| Method | Description |
|---|---|
| `.loadFont(dir)` | Load manifest and register font |
| `.load(fontName, text)` | Ensure characters are loaded |
| `.isCharLoaded(fontName, cp)` | Check if a code point's subset is loaded |
| `.getCharAdvance(fontName, cp)` | Get advance width for a code point |
| `.subscribe(fontName, cb)` | Listen to font update events; returns unsubscribe fn |

#### `LazyBitmapText`

Drop-in `BitmapText` replacement. Constructor options:

| Option | Type | Description |
|---|---|---|
| `fontName` | `string` | Registered font name |
| `fontSize` | `number` | Display size |
| `tint` | `number` | Text color |
| `letterSpacing` | `number` | Extra spacing between chars |
| `maxWidth` | `number` | Word wrap width |
| `align` | `string` | `'left'` / `'center'` / `'right'` |

## How It Works

```
Build time (Node.js)                      Runtime (Browser)
┌─────────────────────┐                   ┌──────────────────────────┐
│ TTF/OTF font        │                   │ loadFont('/fonts/MyFont/')│
│   ↓                 │                   │   ↓ fetch manifest.json  │
│ Split into ~66      │    manifest.json  │   ↓ register empty font  │
│ Unicode subsets     │ ──────────────→   │                          │
│   ↓                 │                   │ new LazyBitmapText('你好')│
│ Render sprite sheets│    subset PNGs    │   ↓ show dot placeholders│
│ + compress PNGs     │ ─ ─ on demand ─→  │   ↓ load needed subsets  │
│   ↓                 │                   │   ↓ replace with glyphs  │
│ Write manifest.json │                   │   ↓ re-render (no shift) │
└─────────────────────┘                   └──────────────────────────┘
```

## Development

```bash
npm run build      # compile src/ and runtime/ to dist/
npm run dev        # watch mode
npm run generate   # generate test font (HYWenHei)
npm run web        # start Vite dev server with demo + benchmark
```

## License

MIT
