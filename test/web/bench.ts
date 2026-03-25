import { Application, BitmapFont, Container, Graphics, Text } from 'pixi.js';
import { BitmapFontManager, LazyBitmapText } from '../../runtime/index.js';

// ─── Canvas size ──────────────────────────────────────────────────────────────
const W = window.innerWidth;
const H = Math.max(window.innerHeight - 138, 420);
const TOP = 26;
const BOT = 10;

// ─── Benchmark profile ────────────────────────────────────────────────────────
const TEXT_FONT_FAMILY =
  "'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'SimHei', sans-serif";

const FONT_SIZES = [14, 16, 18, 22, 28, 36, 48];
const TINTS = [
  0xffffff, 0xffd166, 0x7bdff2, 0xb2f7ef,
  0xf7aef8, 0xff6b6b, 0x95e06c, 0xcdb4db,
];

const SHORT_LABEL_POOL = [
  'HP', 'MP', 'ATK', 'DEF', 'SPD', 'CRIT', 'RES', 'EXP', 'GOLD', 'LV1', 'LV9',
  'AP', 'CP', 'DMG', 'ACC', 'EVA', 'CD', 'SP', 'TP', 'XP', 'Rank', 'Wave',
  '+1', '+3', '+5', '+7', '+9', '+12', '+15', 'NEW', 'HOT', 'SSR', 'UR', 'SR', 'R',
  'Boss', 'VIP', 'Mail', 'Bag', 'Shop', 'Raid', 'Guild', 'Quest', 'Room', 'Team',
  'Solo', 'Duo', 'Buff', 'Debuff', 'Auto', 'Skip', 'Start', 'Pause', 'Ready', 'Clear',
  'Win', 'Lose', 'Drop', 'Loot', 'Craft', 'Build', 'Forge', 'Trade', 'Daily', 'Elite',
  'Trial', 'Event', 'Arena', 'Story', 'Login', 'Bonus', 'Pack', 'Pass', 'Skin', 'Echo',
  '01', '07', '24', '99', '404', '777', '999', 'S1', 'S9', 'A+', 'B+', 'EX', 'DX',
  'OK', 'GO', 'UP', 'MAX', 'MIN', 'ON', 'OFF', 'TOP', 'END', 'KO',
  '生命', '法力', '攻击', '防御', '暴击', '闪避', '护盾', '体力',
  '金币', '经验', '锻造', '稀有', '史诗', '传说', '任务', '掉落',
  '背包', '商城', '邮件', '组队', '匹配', '竞技', '试炼', '签到',
  '冒险', '主线', '支线', '奖励', '强化', '突破', '觉醒', '升星',
  '命中', '格挡', '连击', '抗性', '治疗', '增益', '减益', '召唤',
  '炎', '冰', '雷', '风', '光', '暗', '盾', '剑', '弓', '枪',
  '開始', '終了', '強化', '突破', '覚醒', '伝説', '任務', '報酬',
  '商店', '編成', '戦闘', '支援', '勝利', '敗北', '試練', '冒険',
  '체력', '마나', '공격', '방어', '치명', '회피', '보상', '상점',
  '임무', '전설', '강화', '각성', '승리', '패배', '시작', '종료',
  '★', '☆', '✓', '✦', '✧', '∞', 'Ω', 'λ', 'β', 'Δ',
  '①', '②', '③', '④', '⑤', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ',
  '火', '水', '土', '金', '木', '月', '日', '星', '空', '海',
];

interface BenchSample {
  text: string;
  fontSize: number;
  tint: number;
}

const BENCH_SAMPLES: BenchSample[] = SHORT_LABEL_POOL.map((text, idx) => ({
  text,
  fontSize: FONT_SIZES[idx % FONT_SIZES.length],
  tint: TINTS[(idx * 3) % TINTS.length],
}));

const AUTO_REBUILD_INTERVAL_MS = 1800;

// PixiJS SpriteBatch binds up to 16 unique textures per draw call (WebGL2)
const SPRITE_BATCH_SIZE = 16;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const statFPS        = document.getElementById('stat-fps')!;
const statFrame      = document.getElementById('stat-frame')!;
const statUpdate     = document.getElementById('stat-update')!;
const statCreate     = document.getElementById('stat-create')!;
const statCount      = document.getElementById('stat-count')!;
const statDraws      = document.getElementById('stat-draws')!;
const statBuildFrame = document.getElementById('stat-change-frame')!;
// ─── PixiJS app ───────────────────────────────────────────────────────────────
const app = new Application({
  width: W,
  height: H,
  backgroundColor: 0x080c14,
  antialias: false,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
document.getElementById('canvas-container')!.appendChild(app.view as HTMLCanvasElement);

// ─── Benchmark object ─────────────────────────────────────────────────────────
interface Particle {
  obj: Text | LazyBitmapText;
}

// ─── Scene ────────────────────────────────────────────────────────────────────
const bg = new Graphics();
app.stage.addChild(bg);

function drawBg(mode: Mode): void {
  bg.clear();
  bg.beginFill(mode === 'text' ? 0x0d1017 : 0x0b1510).drawRect(0, 0, W, H).endFill();
}

const particleLayer = new Container();
app.stage.addChild(particleLayer);

const watermark = new Text('', { fontSize: 12, fill: 0x1e3040, fontFamily: 'monospace' });
watermark.x = 6;
watermark.y = 5;
app.stage.addChild(watermark);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sliderToCount(v: number): number {
  return Math.round(Math.exp(Math.log(200) + (Math.log(5000) - Math.log(200)) * v / 100));
}

function estimateTextBounds(text: string, fontSize: number): { approxW: number; approxH: number } {
  const widthUnits = [...text].reduce((sum, ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return sum + (cp <= 0x00ff ? 0.55 : 1);
  }, 0);

  return {
    approxW: Math.max(fontSize * 1.6, widthUnits * fontSize * 0.72 + fontSize * 0.8),
    approxH: fontSize * 1.3,
  };
}

function createObject(mode: Mode, sample: BenchSample): Text | LazyBitmapText {
  return mode === 'text'
    ? new Text(sample.text, {
        fontSize: sample.fontSize,
        fill: sample.tint,
        fontFamily: TEXT_FONT_FAMILY,
      })
    : new LazyBitmapText(sample.text, {
        fontName: 'HYWenHei',
        fontSize: sample.fontSize,
        tint: sample.tint,
      });
}

// Force Pixi to build the actual canvas texture / bitmap mesh during rebuild
// so "creation cost" reflects real work rather than first-render deferral.
function forceObjectBuild(obj: Text | LazyBitmapText): void {
  obj.getLocalBounds();
}

function sampleForIndex(index: number): BenchSample {
  return BENCH_SAMPLES[index % BENCH_SAMPLES.length];
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── State ────────────────────────────────────────────────────────────────────
type Mode = 'text' | 'bitmap';

let mode: Mode = 'bitmap';
let particles: Particle[] = [];
let creationMs = 0;
let isRebuilding = false;
let buildSerial = 0;
let captureBuildFrame = false;
let autoRebuild = false;
let lastAutoRebuildAt = performance.now();
let scheduledRebuildTimer: ReturnType<typeof setTimeout> | null = null;

function resetBenchStats(): void {
  fpsBuf.length = 0;
  statBuildFrame.textContent = '等待中...';
  statBuildFrame.className = 'stat-value warn';
}

function clearParticles(): void {
  for (const p of particles) p.obj.destroy();
  particles = [];
  particleLayer.removeChildren();
}

function prepareEmptyScene(nextMode: Mode): void {
  mode = nextMode;
  clearParticles();
  resetBenchStats();

  drawBg(nextMode);
  watermark.text = nextMode === 'text'
    ? 'PixiJS Text — 切换中...'
    : 'LazyBitmapText — 切换中...';

  statCreate.textContent = '准备中...';
  statCreate.className = 'stat-value warn';
  statCount.textContent = '0';
  statDraws.textContent = '—';
  statDraws.className = 'stat-value';
}

// ─── Build / Rebuild ──────────────────────────────────────────────────────────
async function rebuild(newMode: Mode, count: number): Promise<void> {
  const buildId = ++buildSerial;
  isRebuilding = true;
  prepareEmptyScene(newMode);

  await nextFrame();
  if (buildId !== buildSerial) return;

  try {
    watermark.text = newMode === 'text'
      ? 'PixiJS Text — 短标签驻留渲染 (~N/16 draw calls)'
      : 'LazyBitmapText — 驻留渲染 (draw calls 受 atlas 页数影响)';

    const rng = mulberry32(0x9e3779b9 ^ count);
    const t0 = performance.now();
    const nextParticles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const sample = sampleForIndex(i);
      const { approxW, approxH } = estimateTextBounds(sample.text, sample.fontSize);
      const obj = createObject(newMode, sample);

      forceObjectBuild(obj);
      obj.x = 2 + rng() * Math.max(W - approxW - 4, 4);
      obj.y = TOP + rng() * Math.max(H - TOP - BOT - approxH, 4);
      particleLayer.addChild(obj);

      nextParticles.push({ obj });
    }

    particles = nextParticles;
    creationMs = performance.now() - t0;
    captureBuildFrame = true;
    lastAutoRebuildAt = performance.now();

    const loadedAtlasPages = newMode === 'bitmap'
      ? Object.keys(BitmapFont.available.HYWenHei?.pageTextures ?? {}).length
      : 0;

    const estDraws = newMode === 'text'
      ? `~${Math.ceil(count / SPRITE_BATCH_SIZE)} (独立纹理, ${SPRITE_BATCH_SIZE}个/call)`
      : `~${loadedAtlasPages} atlas页 (共享图集, << N)`;

    statCreate.textContent = `${creationMs.toFixed(0)} ms`;
    statCreate.className =
      `stat-value${creationMs > 500 ? ' danger' : creationMs > 100 ? ' warn' : ''}`;
    statCount.textContent = String(count);
    statDraws.textContent = estDraws;
    statDraws.className = 'stat-value';
  } finally {
    if (buildId === buildSerial) isRebuilding = false;
  }
}

// ─── Render loop ──────────────────────────────────────────────────────────────
const fpsBuf: number[] = [];
let lastFrameTime = performance.now();
let frameCount = 0;
let lastUpdateMs = 0;

app.ticker.add(() => {
  const frameTime = performance.now();
  const dt = Math.min(frameTime - lastFrameTime, 50);
  lastFrameTime = frameTime;
  frameCount++;

  fpsBuf.push(1000 / dt);
  if (fpsBuf.length > 90) fpsBuf.shift();
  const avgFPS = fpsBuf.reduce((a, b) => a + b, 0) / fpsBuf.length;

  const u0 = performance.now();
  if (autoRebuild && !isRebuilding && frameTime - lastAutoRebuildAt >= AUTO_REBUILD_INTERVAL_MS) {
    requestRebuild(mode, currentCount());
  }
  lastUpdateMs = performance.now() - u0;

  if (captureBuildFrame) {
    captureBuildFrame = false;
    statBuildFrame.textContent = `${dt.toFixed(1)} ms`;
    statBuildFrame.className =
      `stat-value${dt > 50 ? ' danger' : dt > 25 ? ' warn' : ''}`;
  }

  if (frameCount % 15 === 0) {
    statFPS.textContent = `${avgFPS.toFixed(1)}`;
    statFPS.className = `stat-value${avgFPS < 20 ? ' danger' : avgFPS < 45 ? ' warn' : ''}`;
    statFrame.textContent = `${dt.toFixed(1)} ms`;
    statUpdate.textContent = `${lastUpdateMs.toFixed(2)} ms`;
  }
});

// ─── Controls ─────────────────────────────────────────────────────────────────
const modeTextBtn   = document.getElementById('modeText') as HTMLButtonElement;
const modeBitmapBtn = document.getElementById('modeBitmap') as HTMLButtonElement;
const countSlider   = document.getElementById('countInput') as HTMLInputElement;
const countLabel    = document.getElementById('countLabel')!;
const animBtn       = document.getElementById('animToggle') as HTMLButtonElement;
const resetBtn      = document.getElementById('resetBtn') as HTMLButtonElement;

function syncModeButtons(m: Mode): void {
  modeTextBtn.classList.toggle('active', m === 'text');
  modeBitmapBtn.classList.toggle('active', m === 'bitmap');
}

function currentCount(): number {
  return sliderToCount(parseInt(countSlider.value, 10));
}

function requestRebuild(newMode: Mode, count: number): void {
  mode = newMode;
  syncModeButtons(newMode);
  if (scheduledRebuildTimer) clearTimeout(scheduledRebuildTimer);
  statCreate.textContent = '等待渲染...';
  statCreate.className = 'stat-value warn';
  scheduledRebuildTimer = setTimeout(() => {
    scheduledRebuildTimer = null;
    void rebuild(newMode, count);
  }, 0);
}

countSlider.addEventListener('input', () => {
  countLabel.textContent = String(sliderToCount(parseInt(countSlider.value, 10)));
});

countSlider.addEventListener('change', () => {
  requestRebuild(mode, currentCount());
});

modeTextBtn.addEventListener('click', () => {
  if (mode === 'text' && !isRebuilding) return;
  requestRebuild('text', currentCount());
});

modeBitmapBtn.addEventListener('click', () => {
  if (mode === 'bitmap' && !isRebuilding) return;
  requestRebuild('bitmap', currentCount());
});

animBtn.addEventListener('click', () => {
  autoRebuild = !autoRebuild;
  animBtn.textContent = autoRebuild ? '⏸ 停止自动重建' : '⟳ 自动重建';
  animBtn.classList.toggle('on', autoRebuild);
  lastAutoRebuildAt = performance.now();
});

resetBtn.addEventListener('click', () => {
  requestRebuild(mode, currentCount());
});

countLabel.textContent = String(sliderToCount(parseInt(countSlider.value, 10)));

// ─── Init ─────────────────────────────────────────────────────────────────────
drawBg('bitmap');
syncModeButtons('bitmap');
statCreate.textContent = '加载字体...';
statCreate.className = 'stat-value warn';
statBuildFrame.textContent = '等待中...';
statBuildFrame.className = 'stat-value warn';

BitmapFontManager.loadFont('/fonts/HYWenHei/').then(async () => {
  requestRebuild('bitmap', currentCount());
}).catch((err: Error) => {
  statCreate.textContent = `字体加载失败: ${err.message}`;
  statCreate.className = 'stat-value danger';
});
