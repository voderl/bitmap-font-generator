import type { BitmapFontManager } from './manager.js';

export interface LazyBitmapTextOptions {
  text: string;
  /** Display font size in pixels (default: 16) */
  fontSize?: number;
  /** PixiJS tint color as 0xRRGGBB (default: 0xffffff) */
  tint?: number;
  /** Text shown while loading (default: '···') */
  placeholder?: string;
  /** Color of the placeholder text (default: 0x888888) */
  placeholderColor?: number;
  /** Letter spacing in pixels (default: 0) */
  letterSpacing?: number;
  /** Max line width before wrapping, 0 = no wrap (default: 0) */
  maxWidth?: number;
  /** Text alignment (default: 'left') */
  align?: 'left' | 'center' | 'right';
}

/**
 * A PixiJS display object that lazily loads the required font subsets before
 * rendering text as a BitmapText.
 *
 * While loading, a plain Text placeholder is shown. Once the font is ready,
 * the placeholder is replaced with a BitmapText.
 *
 * Add `lazyText.container` to the PixiJS stage.
 *
 * @example
 * ```ts
 * const lbt = await LazyBitmapText.create(manager, {
 *   text: '你好世界',
 *   fontSize: 24,
 *   tint: 0xff8800,
 * });
 * app.stage.addChild(lbt.container);
 * ```
 */
export class LazyBitmapText {
  readonly container: import('pixi.js').Container;
  private _manager: BitmapFontManager;
  private _options: Required<LazyBitmapTextOptions>;
  private _bitmapText: import('pixi.js').BitmapText | null = null;
  private _placeholder: import('pixi.js').Text | null = null;
  private _pixi: typeof import('pixi.js');

  private constructor(
    pixi: typeof import('pixi.js'),
    manager: BitmapFontManager,
    options: LazyBitmapTextOptions,
  ) {
    this._pixi = pixi;
    this._manager = manager;
    this._options = {
      text: options.text,
      fontSize: options.fontSize ?? 16,
      tint: options.tint ?? 0xffffff,
      placeholder: options.placeholder ?? '···',
      placeholderColor: options.placeholderColor ?? 0x888888,
      letterSpacing: options.letterSpacing ?? 0,
      maxWidth: options.maxWidth ?? 0,
      align: options.align ?? 'left',
    };
    this.container = new pixi.Container();
  }

  /** Creates and initializes a LazyBitmapText, showing placeholder while loading */
  static async create(
    manager: BitmapFontManager,
    options: LazyBitmapTextOptions,
  ): Promise<LazyBitmapText> {
    const pixi = await import('pixi.js');
    const lbt = new LazyBitmapText(pixi, manager, options);
    lbt._showPlaceholder();
    // Start loading in background — don't await so the container is returned immediately
    lbt._load().catch((err) => console.error('[LazyBitmapText] Load error:', err));
    return lbt;
  }

  private _showPlaceholder(): void {
    const { Text } = this._pixi;
    this._placeholder?.destroy();
    this._placeholder = new Text(this._options.placeholder, {
      fontSize: this._options.fontSize,
      fill: this._options.placeholderColor,
    });
    this.container.addChild(this._placeholder);
  }

  private async _load(): Promise<void> {
    await this._manager.ensureLoaded(this._options.text);
    this._renderBitmapText();
  }

  private _renderBitmapText(): void {
    const { BitmapText } = this._pixi;
    const { text, fontSize, tint, letterSpacing, maxWidth, align } = this._options;

    // Remove placeholder
    if (this._placeholder) {
      this.container.removeChild(this._placeholder);
      this._placeholder.destroy();
      this._placeholder = null;
    }

    // Remove old bitmap text
    if (this._bitmapText) {
      this.container.removeChild(this._bitmapText);
      this._bitmapText.destroy();
      this._bitmapText = null;
    }

    this._bitmapText = new BitmapText(text, {
      fontName: this._manager.fontName,
      fontSize,
      tint,
      letterSpacing,
      maxWidth: maxWidth || undefined,
      align,
    });
    this.container.addChild(this._bitmapText);
  }

  /** Update the text content (triggers loading if new characters are needed) */
  async setText(newText: string): Promise<void> {
    this._options.text = newText;
    this._showPlaceholder();
    await this._load();
  }

  get fontSize(): number { return this._options.fontSize; }
  set fontSize(v: number) {
    this._options.fontSize = v;
    if (this._bitmapText) this._bitmapText.fontSize = v;
    if (this._placeholder) (this._placeholder.style as { fontSize: number }).fontSize = v;
  }

  get tint(): number { return this._options.tint; }
  set tint(v: number) {
    this._options.tint = v;
    if (this._bitmapText) this._bitmapText.tint = v;
  }

  get x(): number { return this.container.x; }
  set x(v: number) { this.container.x = v; }
  get y(): number { return this.container.y; }
  set y(v: number) { this.container.y = v; }

  destroy(): void {
    this._bitmapText?.destroy();
    this._placeholder?.destroy();
    this.container.destroy({ children: true });
  }
}
