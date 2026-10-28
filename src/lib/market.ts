import { readDirection, type DirectionRead, type StrategyKey } from "@/lib/confluence";
import type { Pair } from "@/lib/pairs";
import { findStrategy, type StrategyId } from "@/lib/strategies";

export type { Pair };

export type TimeframeId = "1M" | "3M" | "5M" | "10M";

export type Timeframe = {
  id: TimeframeId;
  label: string;
  short: string;
  ms: number;
  /** Yahoo Finance does not offer 3m/10m, so those are aggregated from 1m/5m. */
  fetchInterval: "1m" | "5m";
  range: string;
};

export const TIMEFRAMES: readonly Timeframe[] = [
  { id: "1M", label: "1 دقيقة (1M)", short: "دقيقة واحدة", ms: 60_000, fetchInterval: "1m", range: "2d" },
  { id: "3M", label: "3 دقائق (3M)", short: "3 دقائق", ms: 180_000, fetchInterval: "1m", range: "5d" },
  { id: "5M", label: "5 دقائق (5M)", short: "5 دقائق", ms: 300_000, fetchInterval: "5m", range: "5d" },
  { id: "10M", label: "10 دقائق (10M)", short: "10 دقائق", ms: 600_000, fetchInterval: "5m", range: "10d" },
];

export function findTimeframe(value: string): Timeframe {
  return TIMEFRAMES.find((item) => item.id === value) ?? TIMEFRAMES[0];
}

export type Candle = { t: number; o: number; h: number; l: number; c: number };

export type Signal = {
  up: boolean;
  confidence: number;
  height: number;
  reasons: string[];
};

export type MarketSnapshot = {
  pair: Pair;
  symbol: string;
  source: string;
  strategy: StrategyId;
  strategyLabel: string;
  timeframe: TimeframeId;
  timeframeLabel: string;
  timeframeShort: string;
  timeframeMs: number;
  price: number;
  previousClose: number;
  changePct: number;
  updatedAt: number;
  lastCandleAt: number;
  /** True when the newest candle is much older than the timeframe (market closed). */
  stale: boolean;
  candles: Candle[];
  levels: { support: number; resistance: number };
  indicators: {
    rsi: number;
    emaFast: number;
    emaSlow: number;
    atr: number;
    atrPct: number;
    momentumPct: number;
    trend: "up" | "down" | "flat";
    trendlineSlopePct: number;
    trendlineQuality: number;
  };
  /** Always-published direction read from the shared engine. */
  decision: DirectionRead;
  signal: {
    candle1: Signal;
    candle2: Signal;
    overall: number;
    bias: "CALL" | "PUT";
    strength: "قوية جداً" | "قوية" | "متوسطة";
  };
};

const SOURCE = "Yahoo Finance (بيانات حية)";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Merge 1m/5m candles into larger buckets (used for 3M and 10M). */
export function aggregate(candles: Candle[], bucketMs: number): Candle[] {
  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const key = Math.floor(candle.t / bucketMs) * bucketMs;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, { ...candle, t: key });
    } else {
      current.h = Math.max(current.h, candle.h);
      current.l = Math.min(current.l, candle.l);
      current.c = candle.c;
    }
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

export function ema(values: number[], period: number): number {
  if (!values.length) return Number.NaN;
  const weight = 2 / (period + 1);
  let result = values[0];
  for (let index = 1; index < values.length; index += 1) {
    result = values[index] * weight + result * (1 - weight);
  }
  return result;
}

export function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const diff = values[index] - values[index - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;

  const relative = averageGain / averageLoss;
  return 100 - 100 / (1 + relative);
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-(period + 1));

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

/** Nearest swing support / resistance over the recent window. */
function swingLevels(candles: Candle[], lookback = 60) {
  const slice = candles.slice(-lookback);
  let support = Number.POSITIVE_INFINITY;
  let resistance = Number.NEGATIVE_INFINITY;

  for (const candle of slice) {
    if (candle.l < support) support = candle.l;
    if (candle.h > resistance) resistance = candle.h;
  }

  if (!Number.isFinite(support) || !Number.isFinite(resistance)) {
    const price = slice[slice.length - 1]?.c ?? 0;
    return { support: price, resistance: price };
  }

  return { support, resistance };
}

/** Least-squares trendline over the last N closes, with R² quality. */
function trendline(values: number[]) {
  const count = values.length;
  if (count < 3) return { slope: 0, r2: 0, fittedLast: values[count - 1] ?? 0 };

  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    numerator += (index - meanX) * (values[index] - meanY);
    denominator += (index - meanX) ** 2;
  }

  const slope = denominator ? numerator / denominator : 0;

  let totalVariance = 0;
  let residual = 0;
  for (let index = 0; index < count; index += 1) {
    const fitted = meanY + slope * (index - meanX);
    totalVariance += (values[index] - meanY) ** 2;
    residual += (values[index] - fitted) ** 2;
  }

  const r2 = totalVariance > 0 ? clamp(1 - residual / totalVariance, 0, 1) : 0;
  const fittedLast = meanY + slope * (count - 1 - meanX);

  return { slope, r2, fittedLast };
}

type Context = {
  candles: Candle[];
  price: number;
  fast: number;
  slow: number;
  rsiValue: number;
  atrValue: number;
  atrPct: number;
  momentumPct: number;
  trend: "up" | "down" | "flat";
  support: number;
  resistance: number;
  slopePct: number;
  quality: number;
};

function buildContext(candles: Candle[]): Context {
  const closes = candles.map((candle) => candle.c);
  const price = closes[closes.length - 1] ?? 0;
  const fast = ema(closes.slice(-40), 9);
  const slow = ema(closes.slice(-90), 21);
  const rsiValue = rsi(closes);
  const atrValue = atr(candles);
  const atrPct = price ? (atrValue / price) * 100 : 0;
  const lookback = Math.min(4, closes.length - 1);
  const momentumPct = price && lookback > 0 ? ((price - closes[closes.length - 1 - lookback]) / price) * 100 : 0;

  const spread = price ? Math.abs(fast - slow) / price : 0;
  const trend: Context["trend"] = spread < 0.00002 ? "flat" : fast > slow ? "up" : "down";

  const { support, resistance } = swingLevels(candles);

  const line = trendline(closes.slice(-30));
  const slopePct = price ? (line.slope / price) * 100 : 0;

  return {
    candles,
    price,
    fast,
    slow,
    rsiValue,
    atrValue,
    atrPct,
    momentumPct,
    trend,
    support,
    resistance,
    slopePct,
    quality: line.r2,
  };
}

/**
 * Maps the direction read onto the two horizon rows the prediction section
 * renders. Both rows always carry the published direction and a confidence.
 */
function signalFromDecision(decision: DirectionRead, horizon: 1 | 2): Signal {
  // The second candle is one step further out, so its published confidence is
  // marginally lower — a fixed, measurable adjustment.
  const confidence =
    horizon === 2
      ? Math.round(clamp(decision.confidence - 0.8, 50, 97) * 10) / 10
      : decision.confidence;

  return {
    up: decision.direction === "CALL",
    confidence,
    height: Math.round(clamp(42 + (confidence - 60) * 1.1, 38, 94)),
    reasons: decision.reasons,
  };
}

export function buildSnapshot(
  pair: Pair,
  timeframe: Timeframe,
  rawCandles: Candle[],
  meta: { price: number; previousClose: number; updatedAt: number },
  strategyId: StrategyId,
): MarketSnapshot {
  const candles = rawCandles.length > 0 ? aggregate(rawCandles, timeframe.ms) : [];
  const closed = candles.slice(0, candles.length > 1 ? -1 : candles.length);
  const series = closed.length >= 20 ? closed : candles;
  const ctx = buildContext(series);

  // The one decision engine — always publishes a direction.
  const decision = readDirection(series, { strategy: strategyId as StrategyKey });

  const candle1 = signalFromDecision(decision, 1);
  const candle2 = signalFromDecision(decision, 2);
  const overall = Math.round(((candle1.confidence + candle2.confidence) / 2) * 10) / 10;
  const strength: MarketSnapshot["signal"]["strength"] =
    overall >= 88 ? "قوية جداً" : overall >= 72 ? "قوية" : "متوسطة";

  const price = meta.price || ctx.price;
  const lastCandleAt = candles.length ? candles[candles.length - 1].t : meta.updatedAt;
  const stale = meta.updatedAt - lastCandleAt > timeframe.ms * 2.5;
  const strategy = findStrategy(strategyId);

  return {
    pair,
    symbol: "",
    source: SOURCE,
    strategy: strategy.id,
    strategyLabel: strategy.label,
    timeframe: timeframe.id,
    timeframeLabel: timeframe.label,
    timeframeShort: timeframe.short,
    timeframeMs: timeframe.ms,
    price,
    previousClose: meta.previousClose,
    changePct: meta.previousClose ? ((price - meta.previousClose) / meta.previousClose) * 100 : 0,
    updatedAt: meta.updatedAt,
    lastCandleAt,
    stale,
    candles: candles.slice(-30),
    levels: { support: ctx.support, resistance: ctx.resistance },
    indicators: {
      rsi: Math.round(ctx.rsiValue * 10) / 10,
      emaFast: ctx.fast,
      emaSlow: ctx.slow,
      atr: ctx.atrValue,
      atrPct: Math.round(ctx.atrPct * 1000) / 1000,
      momentumPct: Math.round(ctx.momentumPct * 1000) / 1000,
      trend: ctx.trend,
      trendlineSlopePct: Math.round(ctx.slopePct * 10000) / 10000,
      trendlineQuality: Math.round(ctx.quality * 1000) / 1000,
    },
    decision,
    signal: {
      candle1,
      candle2,
      overall,
      bias: decision.direction,
      strength,
    },
  };
}
