"use client";
import React from 'react';

import { useEffect, useRef, useState } from "react";

import AssetSelect from "@/components/trading/asset-select";
import BrandMark from "@/components/trading/brand-mark";
import CyberScan from "@/components/trading/cyber-scan";
import StrategySelect from "@/components/trading/strategy-select";
import SoundToggle from "@/components/trading/sound-toggle";
import VolatilityGuard from "@/components/trading/volatility-guard";
import { playScanSound, playSignalSound } from "@/lib/cyber-audio";
import { buildInstantVerdict } from "@/lib/instant-scan";
import { findTimeframe, TIMEFRAMES, type MarketSnapshot } from "@/lib/market";
import { fetchMarket } from "@/lib/market-client";
import { PAIRS } from "@/lib/pairs";
import { isSoundEnabled } from "@/lib/sound-preference";
import type { StrategyId } from "@/lib/strategies";

const RING_RADIUS = 36;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const MIN_SCAN_MS = 550;

type Result = {
  snapshot: MarketSnapshot;
  candleOneOpensAt: number;
};

function formatDuration(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatClock(ts: number) {
  const date = new Date(ts);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/** Timestamp of the next timeframe boundary (open of the coming candle). */
function nextBoundary(now: number, tfMs: number) {
  return now + (tfMs - (now % tfMs));
}

/**
 * Wall-clock read, wrapped so it is obviously a call-time action taken from
 * handlers rather than a render-phase computation.
 */
function nowMs() {
  return Date.now();
}

function trendLabel(trend: MarketSnapshot["indicators"]["trend"]) {
  if (trend === "up") return "صاعد";
  if (trend === "down") return "هابط";
  return "عرضي";
}

function rsiLabel(rsi: number) {
  if (rsi >= 70) return "تشبع شرائي";
  if (rsi <= 30) return "تشبع بيعي";
  return "محايد";
}

export default function PredictionPanel() {
  const [asset, setAsset] = useState<string>(PAIRS[0]);
  // 5M is the lowest intraday timeframe whose provider candles carry a real
  // open/high/low/close for FX, so the strict engine has usable data by default.
  const [timeframe, setTimeframe] = useState<string>("5M");
  const [strategy, setStrategy] = useState<StrategyId>("legendary");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const stopScan = useRef<(() => void) | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const tick = () => setNow(nowMs());
    // First clock read runs in a microtask right after commit: identical output,
    // but no synchronous setState during the commit phase.
    queueMicrotask(tick);
    const id = window.setInterval(tick, 500);
    return () => {
      window.clearInterval(id);
      stopScan.current?.();
      request.current?.abort();
    };
  }, []);

  const timeframeInfo = findTimeframe(timeframe);
  const tfMs = timeframeInfo.ms;

  const live = now !== null;
  const remainingFirst = live ? nextBoundary(now, tfMs) - now : null;
  const remainingSecond = remainingFirst !== null ? remainingFirst + tfMs : null;
  const ringProgress = remainingFirst !== null ? 1 - remainingFirst / tfMs : 1;
  const stale = result !== null && live && now >= result.candleOneOpensAt;
  const snapshot = result?.snapshot ?? null;
  // Same decision layer as the chart-scan section, fed by live candles only.
  const instant = snapshot ? buildInstantVerdict(snapshot, null) : null;

  function haltScan() {
    stopScan.current?.();
    stopScan.current = null;
    request.current?.abort();
    request.current = null;
  }

  function chooseAsset(next: string) {
    haltScan();
    setBusy(false);
    setError("");
    setAsset(next);
    setResult(null);
  }

  function chooseTimeframe(next: string) {
    haltScan();
    setBusy(false);
    setError("");
    setTimeframe(next);
    setResult(null);
  }

  function chooseStrategy(next: StrategyId) {
    haltScan();
    setBusy(false);
    setError("");
    setStrategy(next);
    setResult(null);
  }

  async function run() {
    haltScan();
    setBusy(true);
    setResult(null);
    setError("");

    const controller = new AbortController();
    request.current = controller;
    const startedAt = nowMs();

    if (isSoundEnabled()) stopScan.current = playScanSound(1400);

    try {
      const response = await fetchMarket(asset, timeframe, strategy);
      const elapsed = nowMs() - startedAt;
      if (elapsed < MIN_SCAN_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SCAN_MS - elapsed));
      }
      if (controller.signal.aborted) return;

      setResult({
        snapshot: response,
        candleOneOpensAt: nextBoundary(nowMs(), response.timeframeMs),
      });

      if (isSoundEnabled()) {
        playSignalSound(response.decision.direction === "CALL");
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "تعذر جلب بيانات السوق الحية. تحقق من الاتصال وأعد المحاولة.",
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      stopScan.current?.();
      stopScan.current = null;
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <div className="cyber-panel">
      <p className="cyber-label" id="asset-label">
        اختر الزوج المالي
      </p>
      <AssetSelect
        options={PAIRS}
        value={asset}
        label="اختر الزوج المالي"
        onChange={chooseAsset}
        disabled={busy}
      />

      <p className="cyber-label" id="timeframe-label">
        الإطار الزمني
      </p>
      <div className="grid-options" role="group" aria-labelledby="timeframe-label">
        {TIMEFRAMES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="opt-btn"
            aria-pressed={timeframe === item.id}
            onClick={() => chooseTimeframe(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="cyber-label">استراتيجية التحليل</p>
      <StrategySelect value={strategy} onChange={chooseStrategy} disabled={busy} />

      <button type="button" className="btn-cyber" onClick={run} disabled={busy}>
        {busy ? "جارٍ القراءة من السوق…" : "تحليل السوق الحقيقي الآن ⚡"}
      </button>

      <div
        className="countdown-card"
        role="timer"
        aria-live="off"
        aria-label={
          remainingFirst !== null
            ? `الوقت المتبقي لافتتاح الشمعة القادمة ${formatDuration(remainingFirst)}`
            : "جارٍ مزامنة الساعة"
        }
      >
        <div className="countdown-ring">
          <svg viewBox="0 0 84 84" aria-hidden="true">
            <circle className="ring-track" cx="42" cy="42" r={RING_RADIUS} />
            <circle
              className="ring-value"
              cx="42"
              cy="42"
              r={RING_RADIUS}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * ringProgress}
            />
          </svg>
          <span className="countdown-time">
            {remainingFirst !== null ? formatDuration(remainingFirst) : "--:--"}
          </span>
        </div>
        <div className="countdown-meta">
          <p className="countdown-title">الوقت المتبقي لدخول الصفقة (افتتاح الشمعة القادمة)</p>
          <p className="countdown-sub">
            الإطار: {timeframeInfo.label} · الشمعة 2 تبدأ بعد{" "}
            {remainingSecond !== null ? formatDuration(remainingSecond) : "--:--"}
          </p>
          <p className="countdown-clock">
            {now !== null && remainingFirst !== null ? (
              <>
                يفتح سوق الشمعة 1 عند <b>{formatClock(now + remainingFirst)}</b> بتوقيتك المحلي
              </>
            ) : (
              "جارٍ مزامنة الساعة…"
            )}
          </p>
        </div>
      </div>

      <div className="panel-tools">
        <SoundToggle />
        <span className="live-badge">
          <span className="live-dot" aria-hidden="true" />
          بيانات حية · Yahoo Finance
        </span>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={snapshot ? "cyber-screen is-live" : "cyber-screen"}
        role="status"
        aria-live="polite"
        aria-busy={busy}
      >
        {busy ? <CyberScan asset={asset} timeframe={timeframe} /> : null}

        {busy ? (
          <span className="screen-loading">
            <span className="spinner" aria-hidden="true" />
            جارٍ قراءة شموع <bdi>{asset}</bdi> (<bdi>{timeframe}</bdi>) من السوق…
          </span>
        ) : snapshot ? (
          <>
            <div className="price-strip">
              <span className="price-strip__pair">
                <bdi>{snapshot.pair}</bdi>
              </span>
              <span className="price-strip__price">
                {snapshot.price.toFixed(snapshot.price > 100 ? 2 : 5)}
              </span>
              <span
                className={
                  snapshot.changePct >= 0 ? "price-strip__change up" : "price-strip__change down"
                }
              >
                {snapshot.changePct >= 0 ? "▲" : "▼"} {Math.abs(snapshot.changePct).toFixed(3)}%
              </span>
            </div>
            <span className="strategy-chip">الاستراتيجية: {snapshot.strategyLabel}</span>
            <span className="signal-meta">
              {instant?.headline ?? "إشارة الشمعة القادمة"} · آخر تحديث{" "}
              {formatClock(snapshot.updatedAt)}
            </span>

            {instant ? <VolatilityGuard guard={instant.guard} compact /> : null}

            {snapshot.stale ? (
              <p className="stale-note">السوق مغلق حاليًا — تُعرض آخر بيانات متاحة.</p>
            ) : null}

            <div className={stale ? "candle-stage is-stale" : "candle-stage"}>
              <div className="candle-slots">
                {[snapshot.signal.candle1, snapshot.signal.candle2].map((candle, index) => (
                  <div className="candle-slot" data-dir={candle.up ? "up" : "down"} key={index}>
                    <span
                      className={
                        candle.up ? "candle-chip candle-chip--up" : "candle-chip candle-chip--down"
                      }
                    >
                      {candle.up ? "▲ CALL صعود" : "▼ PUT هبوط"}
                    </span>
                    <div className="candle-plot" aria-hidden="true">
                      <span
                        className="candle-stem"
                        style={{ height: `${Math.min(100, candle.height + 16)}%` }}
                      />
                      <span className="candle-rect" style={{ height: `${candle.height}%` }} />
                    </div>
                    <span className="candle-caption">الشمعة {index + 1}</span>
                    <span className="candle-timer">
                      متبقٍ{" "}
                      <b>
                        {index === 0
                          ? remainingFirst !== null
                            ? formatDuration(remainingFirst)
                            : "--:--"
                          : remainingSecond !== null
                            ? formatDuration(remainingSecond)
                            : "--:--"}
                      </b>
                    </span>
                    <span className="candle-expiry">
                      مدة الصفقة {snapshot.timeframe} · ينتهي{" "}
                      {now !== null && remainingSecond !== null
                        ? formatClock(now + remainingSecond + index * snapshot.timeframeMs)
                        : "--:--"}
                    </span>
                    <span className="candle-confidence">ثقة {candle.confidence}%</span>
                  </div>
                ))}
              </div>

              <div className="trade-summary">
                <BrandMark size={30} />
                <div className="trade-summary__body">
                  <p className="trade-line">
                    الصفقة: الشمعة 1{" "}
                    <b className={snapshot.signal.candle1.up ? "up" : "down"}>
                      {snapshot.signal.candle1.up ? "صعود CALL" : "هبوط PUT"}
                    </b>
                    {" | "}الشمعة 2{" "}
                    <b className={snapshot.signal.candle2.up ? "up" : "down"}>
                      {snapshot.signal.candle2.up ? "صعود CALL" : "هبوط PUT"}
                    </b>
                  </p>
                  <p className="trade-sub">
                    نسبة الثقة الإجمالية:{" "}
                    <b>{instant?.confidence ?? snapshot.signal.overall}%</b> · قوة الإشارة:{" "}
                    <b>{instant?.strength ?? snapshot.signal.strength}</b> · المدة المقترحة:{" "}
                    <b>{instant?.durationLabel ?? snapshot.timeframeShort}</b>
                  </p>
                  <div
                    className="confidence-track"
                    role="progressbar"
                    aria-label="نسبة الثقة الإجمالية"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={instant?.confidence ?? snapshot.signal.overall}
                  >
                    <div
                      className="confidence-fill"
                      style={{ width: `${instant?.confidence ?? snapshot.signal.overall}%` }}
                    />
                  </div>
                </div>
              </div>

              {stale ? (
                <p className="stale-note">
                  بدأت شمعة جديدة — أعد التحليل للحصول على إشارة محدّثة من السوق.
                </p>
              ) : null}

              <div className="indicator-grid">
                <div className="indicator-item">
                  <b>RSI</b>
                  <span>
                    {snapshot.indicators.rsi} · {rsiLabel(snapshot.indicators.rsi)}
                  </span>
                </div>
                <div className="indicator-item">
                  <b>EMA 9/21</b>
                  <span>{trendLabel(snapshot.indicators.trend)}</span>
                </div>
                <div className="indicator-item">
                  <b>ATR</b>
                  <span>{snapshot.indicators.atrPct}%</span>
                </div>
                <div className="indicator-item">
                  <b>الزخم</b>
                  <span>
                    {snapshot.indicators.momentumPct >= 0 ? "+" : ""}
                    {snapshot.indicators.momentumPct}%
                  </span>
                </div>
              </div>

              <ul className="reason-list">
                {snapshot.decision.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>

              <span className="signal-meta signal-brand">
                <BrandMark size={22} />
                ABO NASER TRADING AI · {snapshot.source}
              </span>
            </div>
          </>
        ) : (
          <span className="screen-hint">
            اضغط «تحليل السوق الحقيقي» لقراءة الشموع الفعلية للزوج والإطار المختارين، وستظهر الإشارة
            فورًا (CALL أو PUT) مع نسبة الثقة والمدة المقترحة.
          </span>
        )}
      </div>

      <p className="demo-note">
        <span aria-hidden="true">ℹ️</span>
        <span>
          يقرأ المحرك الاتجاه العام للشموع على بيانات Yahoo Finance الحية ويعرض الإشارة فورًا: اتجاه صاعد
          = CALL، واتجاه هابط = PUT، مع نسبة الثقة والمدة المقترحة وعدّاد الدخول. نسبة الثقة تقيس قوة
          الأدلة (البنية والزخم والموقع) وليست ضمانًا للربح، ولا تُعد توصية استثمارية.
        </span>
      </p>
    </div>
  );
}
