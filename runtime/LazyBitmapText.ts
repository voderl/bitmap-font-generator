import { Container, BitmapText } from 'pixi.js';
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
 * A PixiJS Container that lazily loads bitmap font subsets and renders text.
 *
 * Uses a single BitmapText at all times. While subsets are still downloading,
 * unloaded glyphs are mapped to dot placeholder glyphs (registered in the
 * BitmapFont with the correct advance width) so the layout never shifts.
 * As each subset finishes loading the BitmapText is rebuilt to show real glyphs.
 *
 * Add directly to the stage — no `.container` wrapper needed.
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
export class LazyBitmapText extends Container {
  private _text: string;
  private _opts: Required<LazyBitmapTextOptions>;
  private _bitmapText: BitmapText | null = null;
  private _unsubscribe: (() => void) | null = null;

  constructor(text: string, options: LazyBitmapTextOptions) {
    super();
    this._text = text;
    this._opts = {
      fontName: options.fontName,
      fontSize: options.fontSize ?? 16,
      tint: options.tint ?? 0xffffff,
      letterSpacing: options.letterSpacing ?? 0,
      maxWidth: options.maxWidth ?? 0,
      align: options.align ?? 'left',
    };
    this._unsubscribe = BitmapFontManager.subscribe(this._opts.fontName, () => {
      this._refresh();
    });
    this._refresh();
    this._triggerLoad(text);
  }

  get text(): string { return this._text; }
  set text(value: string) {
    if (this._text === value) return;
    this._text = value;
    this._refresh();
    this._triggerLoad(value);
  }

  get fontSize(): number { return this._opts.fontSize; }
  set fontSize(v: number) {
    this._opts.fontSize = v;
    this._refresh();
  }

  get tint(): number { return this._opts.tint; }
  set tint(v: number) {
    this._opts.tint = v;
    if (this._bitmapText) this._bitmapText.tint = v;
  }

  destroy(...args: Parameters<Container['destroy']>): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    super.destroy(...args);
  }

  /**
   * Rebuilds the BitmapText from scratch. Called on construction, text change,
   * and each time a new subset finishes loading.
   *
   * Creating a new BitmapText forces PixiJS to re-look up every glyph from the
   * currently installed BitmapFont — picking up real glyphs for newly loaded
   * subsets and dot placeholders for the rest.
   */
  private _refresh(): void {
    const { fontName, fontSize, tint, letterSpacing, maxWidth, align } = this._opts;
    const next = new BitmapText(this._text, {
      fontName,
      fontSize,
      tint,
      letterSpacing,
      maxWidth: maxWidth || undefined,
      align,
    });
    this.addChild(next);
    this._bitmapText?.destroy();
    this._bitmapText = next;
  }

  private _triggerLoad(text: string): void {
    BitmapFontManager.load(this._opts.fontName, text).catch((err) => {
      console.error('[LazyBitmapText]', err);
    });
  }
}
