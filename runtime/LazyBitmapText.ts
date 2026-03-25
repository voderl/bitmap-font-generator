import { BitmapText } from 'pixi.js';
import { BitmapFontManager } from './manager.js';

export interface LazyBitmapTextOptions {
  fontName: string;
  fontSize?: number;
  tint?: number;
  letterSpacing?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
}

/**
 * A drop-in replacement for PixiJS BitmapText with lazy subset loading.
 *
 * While subsets are downloading, unloaded glyphs render as dot placeholders
 * (registered in the BitmapFont with the correct advance width so layout never
 * shifts). As each subset finishes loading, `dirty` is set so PixiJS re-draws
 * the text with the real glyphs on the next frame.
 *
 * `instanceof BitmapText` is true. All BitmapText properties (textWidth,
 * textHeight, anchor, …) work natively.
 *
 * @example
 * ```ts
 * await BitmapFontManager.loadFont('/fonts/HYWenHei/');
 *
 * const t = new LazyBitmapText('你好世界', { fontName: 'HYWenHei', fontSize: 24 });
 * app.stage.addChild(t);
 * t.text = '新内容'; // auto lazy-loads new subsets
 * ```
 */
export class LazyBitmapText extends BitmapText {
  private _unsubscribe: (() => void) | null = null;

  constructor(text: string, options: LazyBitmapTextOptions) {
    super(text, options);
    this._unsubscribe = BitmapFontManager.subscribe(options.fontName, () => {
      this.dirty = true;
    });
    BitmapFontManager.load(options.fontName, text).catch((err) => {
      console.error('[LazyBitmapText]', err);
    });
  }

  get text(): string { return super.text; }
  set text(value: string) {
    super.text = value;
    BitmapFontManager.load(this.fontName, value).catch((err) => {
      console.error('[LazyBitmapText]', err);
    });
  }

  destroy(...args: Parameters<BitmapText['destroy']>): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    super.destroy(...args);
  }
}
