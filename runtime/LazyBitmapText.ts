import { Container, Text, BitmapText } from 'pixi.js';
import { BitmapFontManager } from './manager.js';

export interface LazyBitmapTextOptions {
  fontName: string;
  fontSize?: number;
  tint?: number;
  /** Text shown while loading (default: '···') */
  placeholder?: string;
  placeholderColor?: number;
  letterSpacing?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
}

/**
 * A PixiJS Container that lazily loads bitmap font subsets and renders text.
 *
 * Shows a placeholder while loading, then switches to BitmapText.
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
  private _placeholder: Text | null = null;

  constructor(text: string, options: LazyBitmapTextOptions) {
    super();
    this._text = text;
    this._opts = {
      fontName: options.fontName,
      fontSize: options.fontSize ?? 16,
      tint: options.tint ?? 0xffffff,
      placeholder: options.placeholder ?? '···',
      placeholderColor: options.placeholderColor ?? 0x888888,
      letterSpacing: options.letterSpacing ?? 0,
      maxWidth: options.maxWidth ?? 0,
      align: options.align ?? 'left',
    };
    this._showPlaceholder();
    this._triggerLoad(text);
  }

  get text(): string { return this._text; }
  set text(value: string) {
    if (this._text === value) return;
    this._text = value;
    this._showPlaceholder();
    this._triggerLoad(value);
  }

  get fontSize(): number { return this._opts.fontSize; }
  set fontSize(v: number) {
    this._opts.fontSize = v;
    if (this._bitmapText) this._bitmapText.fontSize = v;
    if (this._placeholder) (this._placeholder.style as { fontSize: number }).fontSize = v;
  }

  get tint(): number { return this._opts.tint; }
  set tint(v: number) {
    this._opts.tint = v;
    if (this._bitmapText) this._bitmapText.tint = v;
  }

  private _showPlaceholder(): void {
    this._bitmapText?.destroy();
    this._bitmapText = null;
    this._placeholder?.destroy();
    this._placeholder = new Text(this._opts.placeholder, {
      fontSize: this._opts.fontSize,
      fill: this._opts.placeholderColor,
    });
    this.addChild(this._placeholder);
  }

  private _triggerLoad(text: string): void {
    BitmapFontManager.load(this._opts.fontName, text)
      .then(() => {
        if (this._text !== text) return; // text changed while loading
        this._renderBitmapText();
      })
      .catch((err) => console.error('[LazyBitmapText]', err));
  }

  private _renderBitmapText(): void {
    const { fontName, fontSize, tint, letterSpacing, maxWidth, align } = this._opts;
    this._placeholder?.destroy();
    this._placeholder = null;
    this._bitmapText?.destroy();
    this._bitmapText = new BitmapText(this._text, {
      fontName,
      fontSize,
      tint,
      letterSpacing,
      maxWidth: maxWidth || undefined,
      align,
    });
    this.addChild(this._bitmapText);
  }
}
