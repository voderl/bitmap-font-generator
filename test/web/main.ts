import { Application, BitmapText, Text, Container } from 'pixi.js';
import { BitmapFontManager } from '../../runtime/manager.js';

// ─── Status UI ────────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status')!;
function setStatus(msg: string) { statusEl.textContent = msg; }

// ─── PixiJS App ───────────────────────────────────────────────────────────────

const app = new Application({
  width: 1200,
  height: 720,
  backgroundColor: 0x1a1a2e,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
document.getElementById('canvas-container')!.appendChild(app.view as HTMLCanvasElement);

// ─── Font Manager ─────────────────────────────────────────────────────────────

const manager = new BitmapFontManager({ baseUrl: '/fonts/' });

setStatus('Loading font manifest...');
manager.loadManifest('HYWenHei_manifest.json').then(() => {
  setStatus('Manifest loaded — starting demo...');
  runDemo();
}).catch(err => setStatus(`Error loading manifest: ${err.message}`));

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
    const label = new Text(row.label, { fontSize: 11, fill: 0x667788 });
    label.y = yOffset;
    demoContainer.addChild(label);

    // Placeholder while loading
    const placeholder = new Text('[Loading…]', { fontSize: row.fontSize * 0.5, fill: 0x555577 });
    placeholder.y = yOffset + 14;
    demoContainer.addChild(placeholder);

    const capturedY = yOffset + 14;
    manager.ensureLoaded(row.text).then(() => {
      if (placeholder.destroyed) return;
      placeholder.destroy();

      const bt = new BitmapText(row.text, {
        fontName: manager.fontName,
        fontSize: row.fontSize,
        tint: row.tint,
      });
      bt.y = capturedY;
      demoContainer.addChild(bt);
    }).catch(err => {
      placeholder.text = `[Error: ${err.message}]`;
    });

    yOffset += row.fontSize + 28;
  }

  // ─── Interactive Section ──────────────────────────────────────────────────

  const interactiveContainer = new Container();
  interactiveContainer.x = 40;
  interactiveContainer.y = 540;
  app.stage.addChild(interactiveContainer);

  new Text('Interactive:', { fontSize: 12, fill: 0x667788 });

  let activeBt: BitmapText | null = null;
  let activePlaceholder: Text | null = null;

  function renderInteractive() {
    const text = (document.getElementById('textInput') as HTMLInputElement).value;
    const fontSize = parseInt((document.getElementById('sizeInput') as HTMLInputElement).value);
    const colorHex = (document.getElementById('colorInput') as HTMLInputElement).value;
    const tint = parseInt(colorHex.replace('#', ''), 16);
    const align = (document.getElementById('alignInput') as HTMLSelectElement).value as 'left' | 'center' | 'right';
    const maxWidth = parseInt((document.getElementById('maxWidthInput') as HTMLInputElement).value) || 0;

    activeBt?.destroy();
    activeBt = null;
    activePlaceholder?.destroy();

    activePlaceholder = new Text('Loading…', { fontSize: 13, fill: 0x555577 });
    activePlaceholder.y = 0;
    interactiveContainer.addChild(activePlaceholder);

    setStatus(`Loading subsets for: "${text.slice(0, 40)}"`);

    manager.ensureLoaded(text).then(() => {
      activePlaceholder?.destroy();
      activePlaceholder = null;

      activeBt = new BitmapText(text, {
        fontName: manager.fontName,
        fontSize,
        tint,
        align,
        maxWidth: maxWidth || undefined,
      });
      activeBt.y = 0;
      interactiveContainer.addChild(activeBt);
      setStatus(`✓ ${text.length} chars · ${fontSize}px · tint #${tint.toString(16).padStart(6, '0')}`);
    }).catch(err => {
      if (activePlaceholder) activePlaceholder.text = `Error: ${err.message}`;
      setStatus(`Error: ${err.message}`);
    });
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
  document.getElementById('maxWidthInput')!.addEventListener('input', (e) => {
    document.getElementById('maxWidthLabel')!.textContent = (e.target as HTMLInputElement).value;
    debounce(renderInteractive);
  });

  renderInteractive();
}
