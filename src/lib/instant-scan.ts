/**
 * Instant Scan — the shared layer behind BOTH the chart-screenshot section and
 * the future-candle prediction section.
 *
 * It always publishes a direction. The live market read and the uploaded-chart
 * read are fused:
 *
 *  - same direction  -> confidence boosted, source "both",
 *  - different read  -> the stronger, more confident source leads and the other
 *    is mentioned in one line (no dead end, no "no signal").
 *
 * The Volatility Guard is now an informational risk note only: it never
 * suspends the signal.
 */

import type { VisionReport } from "@/lib/chart-vision";
import type { DecisionSource, RegimeInfo, TrendRead } from "@/lib/confluence";
import type { MarketSnapshot } from "@/lib/market";
import { readImageDirection } from "@/lib/vision-decision";

export type GuardLevel = "stable" | "caution" | "danger";

export type GuardState = {
  level: GuardLevel;
  irregularity: number;
  title: string;
  message: string;
};

export type VerdictSource = DecisionSource | "both";

export type InstantVerdict = {
  up: boolean;
  /** Measured 52..97 — always present. */
  confidence: number;
  strength: "قوية جداً" | "قوية" | "متوسطة";
  durationMs: number;
  durationLabel: string;
  guard: GuardState;
  source: VerdictSource;
  trend: TrendRead;
  regime: RegimeInfo;
  reasons: string[];
  headline: string;
  vision: VisionReport | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function guardFor(irregularity: number, snapshot: MarketSnapshot, ranging: boolean): GuardState {
  if (irregularity >= 60) {
    return {
      level: "danger",
      irregularity,
      title: "Volatility Guard · تذبذب عالٍ",
      message:
        "أحجام الشموع متباينة بشدة. الإشارة صالحة لكن خفّض حجم الدخول إلى النصف وانتظر إغلاق الشمعة الجارية.",
    };
  }

  if (irregularity >= 40) {
    return {
      level: "caution",
      irregularity,
      title: "Volatility Guard · تذبذب متوسط",
      message: "حركة الشموع غير منتظمة نسبيًا — نفّذ بحجم مخاطرة أصغر.",
    };
  }

  if (snapshot.stale) {
    return {
      level: "caution",
      irregularity,
      title: "Volatility Guard · السوق مغلق",
      message: "آخر شمعة قديمة (السوق مغلق). أعد الفحص عند إعادة الفتح قبل التنفيذ.",
    };
  }

  return {
    level: "stable",
    irregularity,
    title: ranging ? "Volatility Guard · حركة عرضية" : "Volatility Guard · تذبذب منتظم",
    message: ranging
      ? "لا يوجد اتجاه قوي، لكن المحرك أعطى الإشارة من أقرب ميل واضح — التزم بإدارة المخاطر."
      : "حركة الشموع منتظمة ولها اتجاه واضح — الشارت يسمح بالتنفيذ.",
  };
}

export function buildInstantVerdict(
  snapshot: MarketSnapshot,
  vision: VisionReport | null,
): InstantVerdict {
  const market = snapshot.decision;
  const report = vision?.ok ? vision : null;
  const image = report ? readImageDirection(report) : null;

  let direction = market.direction;
  let confidence = market.confidence;
  let source: VerdictSource = "market";
  let trend = market.trend;
  let reasons = market.reasons;

  if (image) {
    if (image.direction === market.direction) {
      direction = image.direction;
      confidence = Math.round(clamp(Math.max(image.confidence, market.confidence) + 1.8, 0, 97) * 10) / 10;
      source = "both";
      trend = image.trend.strength >= market.trend.strength ? image.trend : market.trend;
      reasons = [
        ...image.reasons.slice(0, 2),
        ...market.reasons.slice(0, 2),
        "الصورة والسوق متطابقان — تعزيز الثقة",
      ];
    } else if (image.confidence >= market.confidence) {
      direction = image.direction;
      confidence = Math.round((image.confidence * 0.85 + market.confidence * 0.15) * 10) / 10;
      source = "image";
      trend = image.trend;
      reasons = [
        ...image.reasons.slice(0, 2),
        `ملاحظة: بيانات السوق الحية تميل ${market.direction} بثقة ${market.confidence}% — الوزن للشارت المرفوع`,
      ];
    } else {
      direction = market.direction;
      confidence = Math.round((market.confidence * 0.85 + image.confidence * 0.15) * 10) / 10;
      source = "market";
      reasons = [
        ...market.reasons.slice(0, 2),
        `ملاحظة: الشارت المرفوع يميل ${image.direction} — الوزن لبيانات السوق الحية`,
      ];
    }
  }

  const irregularity = report
    ? Math.round(market.regime.irregularity * 0.4 + report.volatility * 0.6)
    : market.regime.irregularity;

  const control = source === "market" ? market.regime : image?.regime ?? market.regime;
  const guard = guardFor(irregularity, snapshot, control.ranging);

  const strength: InstantVerdict["strength"] =
    confidence >= 88 ? "قوية جداً" : confidence >= 72 ? "قوية" : "متوسطة";

  const sourceLabel =
    source === "both"
      ? "الصورة والسوق متطابقان"
      : source === "image"
        ? "قراءة الشارت المرفوع"
        : "بيانات السوق الحية";

  const headline = `${direction === "CALL" ? "إشارة صعود CALL" : "إشارة هبوط PUT"} — ${sourceLabel}`;

  return {
    up: direction === "CALL",
    confidence,
    strength,
    durationMs: snapshot.timeframeMs,
    durationLabel: snapshot.timeframeShort,
    guard,
    source,
    trend,
    regime: control,
    reasons: [...new Set(reasons)].slice(0, 5),
    headline,
    vision: report,
  };
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function formatClock(ts: number) {
  const date = new Date(ts);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/** Timestamp of the next timeframe boundary (open of the coming candle). */
export function nextBoundary(now: number, timeframeMs: number) {
  return now + (timeframeMs - (now % timeframeMs));
}
