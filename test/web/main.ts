import { Application, Text, Container } from 'pixi.js';
import { BitmapFontManager, LazyBitmapText } from '../../runtime/index.js';

// ─── Status UI ────────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status')!;
function setStatus(msg: string) { statusEl.textContent = msg; }

// ─── PixiJS App ───────────────────────────────────────────────────────────────

const app = new Application();
await app.init({
  width: 1200,
  height: 440,
  backgroundColor: 0x1a1a2e,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
document.getElementById('canvas-container')!.appendChild(app.canvas);

// ─── Load Font ────────────────────────────────────────────────────────────────

setStatus('Loading font...');
BitmapFontManager.loadFont('/fonts/HYWenHei/').then(() => {
  setStatus('Font loaded — starting demo...');
  runDemo();
}).catch(err => setStatus(`Error loading font: ${err.message}`));

// ─── Demo ─────────────────────────────────────────────────────────────────────

function runDemo() {
  const demoContainer = new Container();
  demoContainer.x = 40;
  demoContainer.y = 16;
  app.stage.addChild(demoContainer);

  const rows: { text: string; fontSize: number; tint: number; label: string }[] = [
    { label: '32px · white', text: '中文位图字体 · Bitmap Font Generator', fontSize: 32, tint: 0xffffff },
    { label: '24px · coral', text: '你好世界 · Hello World · 漢字レンダリング', fontSize: 24, tint: 0xff6b6b },
    { label: '16px · lime', text: '子集懒加载 · Lazy subset loading · 한글 테스트', fontSize: 16, tint: 0x6bff8b },
    { label: '48px · gold', text: '位图字体演示', fontSize: 48, tint: 0xffd700 },
    { label: '14px · sky', text: '支持多语言：中文、English、한국어、日本語、fullwidth', fontSize: 14, tint: 0x87ceeb },
  ];

  let yOffset = 0;
  for (const row of rows) {
    const label = new Text({ text: row.label, style: { fontSize: 11, fill: 0x667788 } });
    label.y = yOffset;
    demoContainer.addChild(label);

    const bt = new LazyBitmapText({
      text: row.text,
      style: {
        fontFamily: 'HYWenHei',
        fontSize: row.fontSize,
        fill: row.tint,
      },
    });
    bt.y = yOffset + 14;
    demoContainer.addChild(bt);

    yOffset += row.fontSize + 28;
  }

  // ─── Interactive Section ──────────────────────────────────────────────────

  const interactiveContainer = new Container();
  interactiveContainer.y = yOffset + 20;
  demoContainer.addChild(interactiveContainer);

  const interactiveLabel = new Text({ text: '自定义配置', style: { fontSize: 11, fill: 0x667788 } });
  interactiveLabel.y = 0;
  interactiveContainer.addChild(interactiveLabel);

  let activeLazyText: LazyBitmapText | null = null;

  function renderInteractive() {
    const text = (document.getElementById('textInput') as HTMLInputElement).value;
    const fontSize = parseInt((document.getElementById('sizeInput') as HTMLInputElement).value);
    const colorHex = (document.getElementById('colorInput') as HTMLInputElement).value;
    const tint = parseInt(colorHex.replace('#', ''), 16);
    const align = (document.getElementById('alignInput') as HTMLSelectElement).value as 'left' | 'center' | 'right';
    activeLazyText?.destroy();
    activeLazyText = new LazyBitmapText({
      text,
      style: {
        fontFamily: 'HYWenHei',
        fontSize,
        fill: tint,
        align,
        wordWrap: true,
        wordWrapWidth: 600,
      },
    });
    activeLazyText.y = 14;
    interactiveContainer.addChild(activeLazyText);

    setStatus(`Rendering: "${text.slice(0, 40)}"`);
  }

  let debounceTimer: ReturnType<typeof setTimeout>;
  function debounce(fn: () => void, ms = 400) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, ms);
  }

  document.getElementById('textInput')!.addEventListener('input', () => debounce(renderInteractive));
  document.getElementById('sizeInput')!.addEventListener('input', (e) => {
    document.getElementById('sizeLabel')!.textContent = (e.target as HTMLInputElement).value;
    debounce(renderInteractive);
  });
  document.getElementById('colorInput')!.addEventListener('input', () => debounce(renderInteractive));
  document.getElementById('alignInput')!.addEventListener('change', renderInteractive);

  renderInteractive();
}
