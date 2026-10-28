/**
 * Direction engine — one deterministic read shared by BOTH the future-candle
 * section and the chart-screenshot section.
 *
 * There is no "no signal" branch and no condition checklist. Every scan resolves
 * to a direction (CALL / PUT) with a measured confidence, the suggested
 * duration (the selected timeframe) and a short evidence trail.
 *
 * The direction comes from the actual candle structure:
 *   - EMA 21/50 and slope,
 *   - higher highs / higher lows versus lower highs / lower lows,
 *   - bullish / bearish body dominance.
 *
 * When the structure is not decisive the immediate three-candle lean decides,
 * so the read is never empty. The confidence is derived from how well the
 * evidence agrees (structure, RSI turn, newest candle, entry location, recent
 * dominance) with a penalty for chaotic tape — never a fixed placeholder.
 */

export type Bar = { t: number; o: number; h: number; l: number; c: number };

export type StrategyKey = "sr" | "cross" | "trendline" | "legendary";

export type DecisionSource = "market" | "image";

export type RegimeInfo = {
  adx: number;
  /** Kaufman efficiency ratio 0..1 (higher = cleaner directional move). */
  efficiency: number;
  irregularity: number;
  ranging: boolean;
  label: string;
};

export type TrendRead = {
  direction: 1 | -1;
  /** 0..1 — how decisively the structure reads. */
  strength: number;
  up: number;
  down: number;
  label: string;
  detail: string;
  structure: { hh: number; hl: number; lh: number; ll: number };
};

export type DirectionRead = {
  direction: "CALL" | "PUT";
  source: DecisionSource;
  /** Measured 52..97 — always present. */
  confidence: number;
  strength: "قوية جداً" | "قوية" | "متوسطة";
  regime: RegimeInfo;
  trend: TrendRead;
  /** 2–4 short evidence lines. */
  reasons: string[];
  /** True when the provider candles had no price range. */
  degraded: boolean;
};

const MIN_BARS = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function fmtPrice(price: number) {
  return Math.abs(price) >= 100 ? price.toFixed(2) : price.toFixed(5);
}

// ---------------------------------------------------------------- indicators

/** Wilder RSI series (one value per closed bar from `period` onwards). */
export function rsiSeries(closes: number[], period = 14): number[] {
  const out: number[] = [];
  if (closes.length < period + 1) return out;

  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const diff = closes[index] - closes[index - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }

  let averageGain = gain / period;
  let averageLoss = loss / period;
  const push = () => {
    if (averageGain + averageLoss === 0) out.push(50);
    else if (averageLoss === 0) out.push(100);
    else out.push(100 - 100 / (1 + averageGain / averageLoss));
  };

  push();
  for (let index = period + 1; index < closes.length; index += 1) {
    const diff = closes[index] - closes[index - 1];
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    averageGain = (averageGain * (period - 1) + up) / period;
    averageLoss = (averageLoss * (period - 1) + down) / period;
    push();
  }

  return out;
}

export function atrValue(bars: Bar[], period = 14): number {
  if (bars.length < 2) return 0;
  const slice = bars.slice(-(period + 1));
  let total = 0;
  for (let index = 1; index < slice.length; index += 1) {
    const previousClose = slice[index - 1].c;
    total += Math.max(
      slice[index].h - slice[index].l,
      Math.abs(slice[index].h - previousClose),
      Math.abs(slice[index].l - previousClose),
    );
  }
  return total / (slice.length - 1);
}

/** Irregularity 0..100: candle-range dispersion + direction flips + doji tape. */
export function irregularityOf(bars: Bar[]): number {
  const candles = bars.slice(-24);
  if (candles.length < 8) return 55;

  const ranges = candles.map((candle) => Math.max(1e-9, candle.h - candle.l));
  const mean = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  const variance = ranges.reduce((sum, value) => sum + (value - mean) ** 2, 0) / ranges.length;
  const coefficient = mean > 0 ? Math.sqrt(variance) / mean : 0;

  let flips = 0;
  for (let index = 1; index < candles.length; index += 1) {
    const previous = Math.sign(candles[index - 1].c - candles[index - 1].o);
    const current = Math.sign(candles[index].c - candles[index].o);
    if (previous !== 0 && current !== 0 && previous !== current) flips += 1;
  }
  const flipRatio = flips / Math.max(1, candles.length - 1);

  const bodyRatio =
    candles.reduce(
      (sum, candle) => sum + Math.abs(candle.c - candle.o) / Math.max(1e-9, candle.h - candle.l),
      0,
    ) / candles.length;
  const chop = bodyRatio < 0.35 ? (0.35 - bodyRatio) * 130 : 0;

  return Math.round(clamp(coefficient * 62 + flipRatio * 44 + chop, 0, 100));
}

/** ADX(14) — trend strength, reported as context. */
export function adxValue(bars: Bar[], period = 14): number {
  if (bars.length < period * 2) return 0;

  const trs: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];

  for (let index = 1; index < bars.length; index += 1) {
    const up = bars[index].h - bars[index - 1].h;
    const down = bars[index - 1].l - bars[index].l;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    trs.push(
      Math.max(
        bars[index].h - bars[index].l,
        Math.abs(bars[index].h - bars[index - 1].c),
        Math.abs(bars[index].l - bars[index - 1].c),
      ),
    );
  }

  const wilder = (values: number[]) => {
    const out: number[] = [];
    let sum = values.slice(0, period).reduce((total, value) => total + value, 0);
    out.push(sum);
    for (let index = period; index < values.length; index += 1) {
      sum = sum - sum / period + values[index];
      out.push(sum);
    }
    return out;
  };

  const trSmooth = wilder(trs);
  const plusSmooth = wilder(plusDm);
  const minusSmooth = wilder(minusDm);

  const dx: number[] = [];
  for (let index = 0; index < trSmooth.length; index += 1) {
    if (!trSmooth[index]) {
      dx.push(0);
      continue;
    }
    const plus = (plusSmooth[index] / trSmooth[index]) * 100;
    const minus = (minusSmooth[index] / trSmooth[index]) * 100;
    dx.push(plus + minus > 0 ? (Math.abs(plus - minus) / (plus + minus)) * 100 : 0);
  }

  const window = dx.slice(-period);
  return window.length ? window.reduce((total, value) => total + value, 0) / window.length : 0;
}

/** Kaufman efficiency ratio: net move / total travelled distance. */
export function efficiencyRatio(bars: Bar[], period = 20): number {
  const slice = bars.slice(-(period + 1));
  if (slice.length < 4) return 0;
  let travelled = 0;
  for (let index = 1; index < slice.length; index += 1) {
    travelled += Math.abs(slice[index].c - slice[index - 1].c);
  }
  if (!travelled) return 0;
  return clamp(Math.abs(slice[slice.length - 1].c - slice[0].c) / travelled, 0, 1);
}

function emaLast(values: number[], period: number) {
  if (!values.length) return Number.NaN;
  const weight = 2 / (period + 1);
  let result = values[0];
  for (let index = 1; index < values.length; index += 1) {
    result = values[index] * weight + result * (1 - weight);
  }
  return result;
}

// --------------------------------------------------------------- structure

function pivotPoints(bars: Bar[]) {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let index = 2; index < bars.length - 2; index += 1) {
    if (
      bars[index].h >= bars[index - 1].h &&
      bars[index].h > bars[index + 1].h &&
      bars[index].h > bars[index - 2].h
    ) {
      highs.push(bars[index].h);
    }
    if (
      bars[index].l <= bars[index - 1].l &&
      bars[index].l < bars[index + 1].l &&
      bars[index].l < bars[index - 2].l
    ) {
      lows.push(bars[index].l);
    }
  }

  return { highs, lows };
}

function swingCounts(highs: number[], lows: number[]) {
  let hh = 0;
  let lh = 0;
  let hl = 0;
  let ll = 0;

  for (let index = 1; index < highs.length; index += 1) {
    if (highs[index] > highs[index - 1]) hh += 1;
    else lh += 1;
  }
  for (let index = 1; index < lows.length; index += 1) {
    if (lows[index] > lows[index - 1]) hl += 1;
    else ll += 1;
  }

  return { hh, hl, lh, ll };
}

/**
 * Decisive trend read: structure (HH/HL) carries as much weight as the moving
 * averages, so a fresh but clean trend is recognised instead of being labelled
 * "choppy" because ADX has not caught up yet.
 */
export function readTrend(bars: Bar[], atr: number): TrendRead {
  const closes = bars.map((bar) => bar.c);
  const fast = emaLast(closes, 21);
  const slow = emaLast(closes, 50);
  const fastPrev = emaLast(closes.slice(0, -8), 21);
  const emaGap = atr > 0 ? (fast - slow) / atr : 0;
  const emaSlope = atr > 0 ? (fast - fastPrev) / atr : 0;

  const pivots = pivotPoints(bars.slice(-50));
  const structure = swingCounts(pivots.highs, pivots.lows);
  const total = structure.hh + structure.hl + structure.lh + structure.ll;
  const structureUp = total ? (structure.hh + structure.hl) / total : 0.5;
  const structureDown = total ? (structure.lh + structure.ll) / total : 0.5;

  const window = bars.slice(-8);
  const bullBodies = window.filter((bar) => bar.c > bar.o).length;
  const bullDom = window.length ? bullBodies / window.length : 0.5;

  const up =
    0.32 * clamp(emaGap / 1.5, 0, 1) +
    0.24 * clamp(emaSlope / 1, 0, 1) +
    0.28 * structureUp +
    0.16 * bullDom;
  const down =
    0.32 * clamp(-emaGap / 1.5, 0, 1) +
    0.24 * clamp(-emaSlope / 1, 0, 1) +
    0.28 * structureDown +
    0.16 * (1 - bullDom);

  const direction: 1 | -1 = up >= down ? 1 : -1;
  const strength = Math.round(clamp(Math.max(up, down), 0, 1) * 100) / 100;
  const label =
    strength >= 0.62
      ? direction === 1
        ? "صاعد قوي"
        : "هابط قوي"
      : strength >= 0.42
        ? direction === 1
          ? "صاعد واضح"
          : "هابط واضح"
        : direction === 1
          ? "صاعد ضعيف"
          : "هابط ضعيف";

  return {
    direction,
    strength,
    up: Math.round(up * 100) / 100,
    down: Math.round(down * 100) / 100,
    label,
    structure,
    detail: `${structure.hh} قمة صاعدة · ${structure.hl} قاع صاعد · ${structure.lh} قمة هابطة · ${structure.ll} قاع هابط`,
  };
}

// ---------------------------------------------------------------- direction

/**
 * Read the next direction from the closed candles. Always returns a result.
 */
export function readDirection(
  rawBars: Bar[],
  // Reserved: kept so callers can pass the strategy without changing the API.
  _options: { strategy?: StrategyKey } = {},
): DirectionRead {
  const bars = rawBars.slice(-90);
  const atr = atrValue(bars);
  const irregularity = irregularityOf(bars);
  const adx = adxValue(bars);
  const efficiency = efficiencyRatio(bars);
  const trend = readTrend(bars, atr);

  const sample = bars.slice(-40);
  const flatBars = sample.filter((bar) => bar.h === bar.l).length;
  const degraded = sample.length > 0 && flatBars / sample.length > 0.5;

  const closes = bars.map((bar) => bar.c);
  const series = rsiSeries(closes);
  const last = bars[bars.length - 1] ?? { t: 0, o: 0, h: 0, l: 0, c: 0 };
  const rsi = series.length ? series[series.length - 1] : 50;
  const previousRsi = series.length > 1 ? series[series.length - 2] : rsi;

  const last3 = bars.slice(-3);
  const bull3 = last3.filter((bar) => bar.c > bar.o).length;
  const lean: 1 | -1 = bull3 >= 2 ? 1 : bull3 <= 1 ? -1 : last.c >= last.o ? 1 : -1;

  // Structure leads; an unclear structure falls back to the immediate lean so
  // the trader always gets a decisive read.
  const direction: 1 | -1 = trend.strength >= 0.4 ? trend.direction : lean;

  const structure = trend.structure;
  const totalPivots = structure.hh + structure.hl + structure.lh + structure.ll;
  const structureAgree = totalPivots
    ? direction === 1
      ? (structure.hh + structure.hl) / totalPivots
      : (structure.lh + structure.ll) / totalPivots
    : 0.5;

  const rsiRoom = direction === 1 ? clamp((62 - rsi) / 30, 0, 1) : clamp((rsi - 38) / 30, 0, 1);
  const rsiTurn = direction === 1 ? (rsi > previousRsi ? 1 : 0) : (rsi < previousRsi ? 1 : 0);
  const candleAgree = direction === 1 ? (last.c > last.o ? 1 : 0) : (last.c < last.o ? 1 : 0);

  const last20 = bars.slice(-20);
  const high20 = Math.max(...last20.map((bar) => bar.h));
  const low20 = Math.min(...last20.map((bar) => bar.l));
  const span = Math.max(atr, high20 - low20);
  const position = clamp((last.c - low20) / span, 0, 1);
  const locationAgree = direction === 1 ? clamp(1 - position, 0, 1) : clamp(position, 0, 1);

  const last5 = bars.slice(-5);
  const dominanceAgree = direction === 1
    ? last5.filter((bar) => bar.c > bar.o).length / Math.max(1, last5.length)
    : last5.filter((bar) => bar.c < bar.o).length / Math.max(1, last5.length);

  const quality =
    trend.strength * 0.34 +
    structureAgree * 0.2 +
    ((rsiRoom + rsiTurn + candleAgree) / 3) * 0.18 +
    locationAgree * 0.14 +
    dominanceAgree * 0.14;

  const confidence = round1(
    clamp(58 + quality * 40 - (irregularity / 100) * 6 + (degraded ? -4 : 0), 52, 97),
  );

  const strength: DirectionRead["strength"] =
    confidence >= 88 ? "قوية جداً" : confidence >= 72 ? "قوية" : "متوسطة";

  const pivots = pivotPoints(bars.slice(-50));
  const supports = pivots.lows.filter((value) => value <= last.c);
  const resistances = pivots.highs.filter((value) => value >= last.c);
  const support = supports.length ? Math.max(...supports) : null;
  const resistance = resistances.length ? Math.min(...resistances) : null;

  const reasons = [
    `الاتجاه ${trend.label} (${Math.round(trend.strength * 100)}%) — ${trend.detail}`,
    `الزخم ${direction === 1 ? "صاعد" : "هابط"} · RSI ${rsi.toFixed(1)} ${rsiTurn ? "منعطف مع الإشارة" : "مستقر"} · ${Math.round(dominanceAgree * 100)}% من آخر 5 شموع ${direction === 1 ? "صاعدة" : "هابطة"}`,
    `الموقع ${Math.round(position * 100)}% من حركة آخر 20 شمعة — ${
      position <= 0.35 ? "قرب دعم (منطقة دخول مناسبة)" : position >= 0.65 ? "قرب مقاومة" : "منتصف الحركة"
    }`,
  ];

  if (support !== null || resistance !== null) {
    reasons.push(
      [
        support !== null
          ? `أقرب دعم ${fmtPrice(support)} (${((last.c - support) / Math.max(atr, 1e-9)).toFixed(2)} ATR)`
          : null,
        resistance !== null
          ? `أقرب مقاومة ${fmtPrice(resistance)} (${((resistance - last.c) / Math.max(atr, 1e-9)).toFixed(2)} ATR)`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  if (degraded) {
    reasons.push(
      "بيانات المزوّد على هذا الإطار بلا مدى سعري — القراءة مبنية على البنية المتاحة؛ جرّب إطار 5 دقائق لدقة أعلى.",
    );
  }

  const ranging = trend.strength < 0.4 || irregularity >= 55;

  const regime: RegimeInfo = {
    adx: round1(adx),
    efficiency: Math.round(efficiency * 100) / 100,
    irregularity,
    ranging,
    label:
      irregularity >= 55
        ? "تذبذب عشوائي — خفّض حجم الدخول"
        : trend.strength < 0.4
          ? "حركة عرضية — الإشارة مبنية على الميل القريب"
          : `${trend.label} · اتجاه قابل للتداول`,
  };

  return {
    direction: direction === 1 ? "CALL" : "PUT",
    source: "market",
    confidence,
    strength,
    regime,
    trend,
    reasons,
    degraded,
  };
}

/** Kept for callers that only have a handful of candles (never blocks). */
export function minimumBars() {
  return MIN_BARS;
}
