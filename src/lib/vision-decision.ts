/**
 * Image direction — turns the geometry read from the uploaded chart into the
 * same always-published direction used by the live section.
 *
 * There is no gating and no "no signal" path: the picture always resolves to a
 * direction, with a confidence built from what the candles actually show
 * (structure, dominance, the newest candle and where price sits in the swing).
 */

import type { VisionReport } from "@/lib/chart-vision";
import type { DirectionRead, RegimeInfo, TrendRead } from "@/lib/confluence";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function readImageDirection(report: VisionReport): DirectionRead {
  const directionValue: 1 | -1 =
    report.trend === "down" ? -1 : report.trend === "up" ? 1 : report.bias < 0 ? -1 : 1;

  const strength = clamp(report.trendStrength, 0, 1);

  const trend: TrendRead = {
    direction: directionValue,
    strength,
    up: directionValue === 1 ? strength : 1 - strength,
    down: directionValue === -1 ? strength : 1 - strength,
    label: report.trend === "flat" ? "عرضي — اعتماد على الميل الأخير" : report.trendLabel,
    structure: report.structure,
    detail: `${report.structure.hh} قمة صاعدة · ${report.structure.hl} قاع صاعد · ${report.structure.lh} قمة هابطة · ${report.structure.ll} قاع هابط`,
  };

  const recent = report.recentPosition;
  const edgeAligned = directionValue === 1 ? clamp(1 - recent / 100, 0, 1) : clamp(recent / 100, 0, 1);
  const dominance =
    directionValue === 1 ? clamp(report.bullShare, 0, 1) : clamp(1 - report.bullShare, 0, 1);
  const candleAgree =
    directionValue === 1 ? (report.lastBullish ? 1 : 0) : (report.lastBullish ? 0 : 1);
  const wickConfirm =
    directionValue === 1 ? (report.bounce ? 1 : 0) : report.rejection ? 1 : 0;
  const runConfirm =
    directionValue === 1 ? report.bullRun / 5 : (5 - report.bullRun) / 5;

  const quality =
    strength * 0.42 +
    dominance * 0.18 +
    candleAgree * 0.12 +
    edgeAligned * 0.14 +
    runConfirm * 0.08 +
    wickConfirm * 0.06;

  const confidence =
    Math.round(clamp(56 + quality * 41 - (report.volatility / 100) * 5, 52, 97) * 10) / 10;

  const strengthLabel: DirectionRead["strength"] =
    confidence >= 88 ? "قوية جداً" : confidence >= 72 ? "قوية" : "متوسطة";

  const regime: RegimeInfo = {
    adx: 0,
    efficiency: Math.round(strength * 100) / 100,
    irregularity: report.volatility,
    ranging: report.trend === "flat" || report.volatility >= 55,
    label:
      report.volatility >= 55
        ? "تذبذب عشوائي في الصورة — خفّض حجم الدخول"
        : report.trend === "flat"
          ? "اتجاه عرضي في الصورة — الإشارة من الميل الأخير"
          : `${report.trendLabel} على الشارت المرفوع`,
  };

  const positionNote =
    wickConfirm && directionValue === 1
      ? "شمعة ارتداد من منطقة الدعم"
      : wickConfirm
        ? "شمعة رفض عند منطقة المقاومة"
        : recent <= 35
          ? "قرب دعم (منطقة دخول مناسبة)"
          : recent >= 65
            ? "قرب مقاومة"
            : "منتصف الحركة";

  const reasons = [
    `الاتجاه ${trend.label} (${Math.round(strength * 100)}%) — ${trend.detail}`,
    `السيطرة ${Math.round(report.bullShare * 100)}% ${report.bullShare >= 0.5 ? "شراء" : "بيع"} · ${report.bullRun}/5 شموع خضراء · آخر شمعة ${report.lastBullish ? "خضراء" : "حمراء"} بجسم ${Math.round(report.lastBody * 100)}%`,
    `الموقع ${recent}% من حركة آخر 20 شمعة — ${positionNote}`,
    `المدى: دعم ${report.supportPct}% · مقاومة ${report.resistancePct}% · عشوائية ${report.volatility}/100`,
  ];

  return {
    direction: directionValue === 1 ? "CALL" : "PUT",
    source: "image",
    confidence,
    strength: strengthLabel,
    regime,
    trend,
    reasons,
    degraded: false,
  };
}
