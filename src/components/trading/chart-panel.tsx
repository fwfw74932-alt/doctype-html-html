"use client";
import React from 'react';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import AssetSelect from "@/components/trading/asset-select";
import BrandMark from "@/components/trading/brand-mark";
import CyberScan from "@/components/trading/cyber-scan";
import SoundToggle from "@/components/trading/sound-toggle";
import StrategySelect from "@/components/trading/strategy-select";
import VolatilityGuard from "@/components/trading/volatility-guard";
import { analyzeChartImage } from "@/lib/chart-vision";
import { buildSampleChart } from "@/lib/sample-chart";
import { playScanSound, playSignalSound } from "@/lib/cyber-audio";
import { buildInstantVerdict, type InstantVerdict } from "@/lib/instant-scan";
import { findTimeframe, TIMEFRAMES, type MarketSnapshot } from "@/lib/market";
import { fetchMarket } from "@/lib/market-client";
import { PAIRS } from "@/lib/pairs";
import { isSoundEnabled } from "@/lib/sound-preference";
import type { StrategyId } from "@/lib/strategies";

const MAX_BYTES = 10 * 1024 * 1024;
/** Perceived scan animation. The real analysis finishes far faster. */
const SCAN_MS = 1000;
const RING_RADIUS = 36;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

type ChartFile = { name: string; size: string; url: string };

type Verdict = {
  snapshot: MarketSnapshot;
  scan: InstantVerdict;
  entryDeadline: number;
  expiry: string;
};

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function clockAt(ts: number) {
  const at = new Date(ts);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Timestamp of the next boundary for a given window length. */
function nextBoundary(now: number, windowMs: number) {
  return now + (windowMs - (now % windowMs));
}


export default function ChartPanel() {
  const [file, setFile] = useState<ChartFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [pair, setPair] = useState<string>(PAIRS[0]);
  const [timeframe, setTimeframe] = useState<string>("5M");
  const [strategy, setStrategy] = useState<StrategyId>("legendary");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopSound = useRef<(() => void) | null>(null);
  const reader = useRef<FileReader | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const autoRun = useRef(false);
  const silentRun = useRef(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    queueMicrotask(tick);
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      stopSound.current?.();
      reader.current?.abort();
      request.current?.abort();
    },
    [],
  );

  // ?demo=chart (or #chart-demo) loads the training chart and runs the scan
  // once, so the whole pipeline can be tried from a single link.
  useEffect(() => {
    const demo =
      window.location.hash === "#chart-demo" ||
      new URLSearchParams(window.location.search).get("demo") === "chart";
    if (!demo) return;
    loadSample(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRun.current || !file) return;
    autoRun.current = false;
    void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const timeframeInfo = findTimeframe(timeframe);
  const entryRemaining =
    verdict !== null && now !== null ? Math.max(0, verdict.entryDeadline - now) : null;
  const entryWindow = verdict ? verdict.snapshot.timeframeMs : timeframeInfo.ms;
  const entryProgress = entryRemaining !== null ? 1 - entryRemaining / entryWindow : 1;
  const entryExpired = entryRemaining !== null && entryRemaining <= 0;

  function haltRun() {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    request.current = null;
    stopSound.current?.();
    stopSound.current = null;
  }

  function reset() {
    haltRun();
    reader.current?.abort();
    setFile(null);
    setVerdict(null);
    setBusy(false);
    setError("");
    if (input.current) input.current.value = "";
  }

  /** Loads the built-in training chart; with auto it also runs the full scan. */
  function loadSample(run: boolean) {
    const url = buildSampleChart();
    if (!url) {
      setError("تعذر إنشاء الشارت التوضيحي على هذا الجهاز.");
      return;
    }

    haltRun();
    reader.current?.abort();
    setError("");
    setVerdict(null);
    setBusy(false);
    autoRun.current = run;
    silentRun.current = run;
    setFile({ name: "شارت توضيحي للتدريب", size: "PNG", url });
    if (input.current) input.current.value = "";
  }

  function accept(candidate: File | undefined) {
    if (!candidate) return;

    if (!candidate.type.startsWith("image/")) {
      setError("يرجى اختيار ملف صورة صالح (PNG أو JPG).");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError("حجم الصورة يتجاوز 10 ميجابايت. اختر صورة أصغر.");
      return;
    }

    haltRun();
    reader.current?.abort();
    setError("");
    setVerdict(null);
    setBusy(false);

    const next = new FileReader();
    reader.current = next;
    next.onload = () =>
      setFile({
        name: candidate.name || "لقطة الشارت",
        size: readableSize(candidate.size),
        url: String(next.result),
      });
    next.onerror = () => setError("تعذرت قراءة الصورة. حاول اختيارها مرة أخرى.");
    next.readAsDataURL(candidate);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    accept(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files?.[0]);
  }

  async function analyze() {
    if (!file) {
      setError("يرجى رفع صورة الشارت أولاً!");
      return;
    }

    haltRun();
    setError("");
    setVerdict(null);
    setBusy(true);

    const controller = new AbortController();
    request.current = controller;
    const startedAt = Date.now();
    const silent = silentRun.current;
    silentRun.current = false;

    if (isSoundEnabled() && !silent) stopSound.current = playScanSound(SCAN_MS);

    try {
      // Image vision and live market data run together so the whole read stays
      // in the sub-second range the section promises.
      const [snapshot, vision] = await Promise.all([
        fetchMarket(pair, timeframe, strategy),
        analyzeChartImage(file.url).catch(() => null),
      ]);

      const elapsed = Date.now() - startedAt;
      if (elapsed < SCAN_MS) {
        await new Promise((resolve) => setTimeout(resolve, SCAN_MS - elapsed));
      }
      if (controller.signal.aborted) return;

      const entryDeadline = nextBoundary(Date.now(), snapshot.timeframeMs);
      const scan = buildInstantVerdict(snapshot, vision);

      setVerdict({
        snapshot,
        scan,
        entryDeadline,
        expiry: clockAt(entryDeadline + snapshot.timeframeMs),
      });

      if (isSoundEnabled() && !silent) playSignalSound(scan.up);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "تعذر جلب بيانات السوق الحية. تحقق من الاتصال وأعد المحاولة.",
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      stopSound.current?.();
      stopSound.current = null;
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <>
      <p className="cyber-label">اختر الزوج المالي</p>
      <AssetSelect
        options={PAIRS}
        value={pair}
        label="اختر الزوج المالي"
        disabled={busy}
        onChange={(next) => {
          haltRun();
          setBusy(false);
          setVerdict(null);
          setError("");
          setPair(next);
        }}
      />

      <p className="cyber-label">الإطار الزمني</p>
      <div className="grid-options" role="group" aria-label="الإطار الزمني">
        {TIMEFRAMES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="opt-btn"
            aria-pressed={timeframe === item.id}
            onClick={() => {
              haltRun();
              setBusy(false);
              setVerdict(null);
              setError("");
              setTimeframe(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="cyber-label">استراتيجية التحليل</p>
      <StrategySelect
        value={strategy}
        disabled={busy}
        onChange={(next) => {
          haltRun();
          setBusy(false);
          setVerdict(null);
          setError("");
          setStrategy(next);
        }}
      />

      <input
        ref={input}
        id="chart-file"
        className="file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        onChange={onPick}
      />

      <label
        className={dragging ? "drop-zone is-dragging" : "drop-zone"}
        htmlFor="chart-file"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="drop-icon" aria-hidden="true">
          📷
        </span>
        <span className="drop-title">ارفع صورة الشارت هنا</span>
        <span className="drop-hint">اضغط للاختيار من جهازك أو هاتفك، أو اسحب الصورة وأفلتها</span>
      </label>

      <div className="sample-row">
        <button
          type="button"
          className="link-btn"
          onClick={() => loadSample(false)}
          disabled={busy}
        >
          لا تملك صورة الآن؟ جرّب الفحص على شارت توضيحي
        </button>
      </div>

      {file ? (
        <div className="preview-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="preview-img" src={file.url} alt={`معاينة الشارت: ${file.name}`} />
          <div className="preview-meta">
            <span>
              {file.name} · {file.size}
            </span>
            <button type="button" className="reset-btn" onClick={reset}>
              إزالة الصورة
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="btn-cyber"
        style={{ marginTop: 16 }}
        onClick={analyze}
        disabled={busy}
      >
        {busy ? "جارٍ الفحص الفوري…" : "فحص فوري وإصدار إشارة قاطعة ⚡"}
      </button>

      <div className="panel-tools">
        <SoundToggle />
        <span style={{ fontSize: 10.5, color: "var(--text-sub)" }}>يعمل عند الضغط فقط</span>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={verdict ? "cyber-screen is-live" : "cyber-screen"}
        role="status"
        aria-live="polite"
        aria-busy={busy}
      >
        {busy ? (
          <>
            <CyberScan asset={file?.name} />
            <span className="screen-loading scan-caption">
              <span className="spinner" aria-hidden="true" />
              جارٍ مسح الشارت وتحديد الصفقة…
            </span>
          </>
        ) : verdict ? (
          <div className="verdict">
            <p className="report-title">
              <BrandMark size={28} /> إشارة الصفقة الفورية (ABO NASER)
            </p>

            <div className="verdict-chips">
              <span className="strategy-chip">الاستراتيجية: {verdict.snapshot.strategyLabel}</span>
              {verdict.scan.vision?.ok ? (
                <span className="vision-chip">
                  <span aria-hidden="true">👁️</span> {verdict.scan.vision.trendLabel} ·{" "}
                  {verdict.scan.vision.candles} شمعة · موقع الدخول{" "}
                  {verdict.scan.vision.recentPosition}%
                </span>
              ) : (
                <span className="vision-chip vision-chip--muted">
                  لم تُقرأ شموع الصورة · اعتماد على السوق
                </span>
              )}
              <span
                className={
                  verdict.scan.source === "image"
                    ? "source-chip is-image"
                    : verdict.scan.source === "both"
                      ? "source-chip is-both"
                      : "source-chip"
                }
              >
                {verdict.scan.source === "image"
                  ? "التحليل من الشارت المرفوع"
                  : verdict.scan.source === "both"
                    ? "الصورة + السوق متطابقان"
                    : "من بيانات السوق الحية"}
              </span>
            </div>

            <VolatilityGuard guard={verdict.scan.guard} />

            <div className="instant-head" data-dir={verdict.scan.up ? "up" : "down"}>
              <span
                className={[
                  "instant-signal",
                  verdict.scan.up ? "instant-signal--up" : "instant-signal--down",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span aria-hidden="true">{verdict.scan.up ? "🟢" : "🔴"}</span>
                {verdict.scan.up ? "صعود CALL" : "هبوط PUT"}
              </span>
              <span className="instant-confidence">
                <b>{verdict.scan.confidence}%</b>
                <span>ثقة {verdict.scan.strength}</span>
              </span>
            </div>

            <div
              className="confidence-track confidence-track--hero"
              role="progressbar"
              aria-label="نسبة ثقة الإشارة الفورية"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={verdict.scan.confidence}
            >
              <div
                className="confidence-fill"
                style={{ width: `${verdict.scan.confidence}%` }}
              />
            </div>

            <div
              className={
                [
                  "countdown-card",
                  "entry-card",
                  entryExpired ? "is-expired" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              data-dir={verdict.scan.up ? "up" : "down"}
              role="timer"
              aria-live="off"
              aria-label={
                entryRemaining !== null
                  ? `الوقت المتبقي لدخول الصفقة ${formatRemaining(entryRemaining)}`
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
                    strokeDashoffset={RING_LENGTH * entryProgress}
                  />
                </svg>
                <span className="countdown-time">
                  {entryRemaining !== null ? formatRemaining(entryRemaining) : "--:--"}
                </span>
              </div>
              <div className="countdown-meta">
                <p className="countdown-title">
                  {entryExpired ? "انتهت صلاحية الدخول" : "الوقت المتبقي لدخول الصفقة"}
                </p>
                <p className="countdown-sub">
                  {entryExpired
                    ? "أعد فحص الشارت للحصول على إشارة دخول جديدة."
                    : `أدخل قبل ${clockAt(verdict.entryDeadline)} — بعدها تُلغى الإشارة.`}
                </p>
                <p className="countdown-clock">
                  الانتهاء المتوقع للصفقة: <b>{verdict.expiry}</b>
                </p>
              </div>
            </div>

            <div className="price-strip">
              <span className="price-strip__pair">
                <bdi>{verdict.snapshot.pair}</bdi>
              </span>
              <span className="price-strip__price">
                {verdict.snapshot.price.toFixed(verdict.snapshot.price > 100 ? 2 : 5)}
              </span>
              <span
                className={
                  verdict.snapshot.changePct >= 0
                    ? "price-strip__change up"
                    : "price-strip__change down"
                }
              >
                {verdict.snapshot.changePct >= 0 ? "▲" : "▼"}{" "}
                {Math.abs(verdict.snapshot.changePct).toFixed(3)}%
              </span>
            </div>

            <div className="ticket" data-dir={verdict.scan.up ? "up" : "down"}>
              <div className="ticket-grid">
                <div className="ticket-cell">
                  <span>المدة المقترحة</span>
                  <b>{verdict.scan.durationLabel}</b>
                </div>
                <div className="ticket-cell">
                  <span>نسبة الثقة</span>
                  <b>{verdict.scan.confidence}%</b>
                </div>
                <div className="ticket-cell">
                  <span>الانتهاء</span>
                  <b>{verdict.expiry}</b>
                </div>
              </div>

              <span className="ticket-note ticket-note--go">
                ✅ إشارة فورية — ادخل خلال العدّاد أعلاه
              </span>
            </div>

            <div className="indicator-grid">
              <div className="indicator-item">
                <b>الشموع المرصودة</b>
                <span>{verdict.scan.vision?.ok ? verdict.scan.vision.candles : "—"}</span>
              </div>
              <div className="indicator-item">
                <b>السيطرة</b>
                <span>
                  {verdict.scan.vision?.ok
                    ? `${Math.round(verdict.scan.vision.bullShare * 100)}% شراء`
                    : "من السوق"}
                </span>
              </div>
              <div className="indicator-item">
                <b>موقع الدخول</b>
                <span>
                  {verdict.scan.vision?.ok
                    ? verdict.scan.vision.recentPosition <= 30
                      ? `قرب الدعم (${verdict.scan.vision.recentPosition}%)`
                      : verdict.scan.vision.recentPosition >= 70
                        ? `قرب المقاومة (${verdict.scan.vision.recentPosition}%)`
                        : `منتصف الحركة (${verdict.scan.vision.recentPosition}%)`
                    : "—"}
                </span>
              </div>
              <div className="indicator-item">
                <b>عشوائية التذبذب</b>
                <span>{verdict.scan.guard.irregularity}/100</span>
              </div>
            </div>

            <ul className="reason-list">
              {verdict.scan.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            <span className="signal-meta signal-brand">
              <BrandMark size={22} />
              ABO NASER TRADING AI · {verdict.snapshot.source}
            </span>
          </div>
        ) : (
          <span className="screen-hint">
            اختر الزوج والإطار، ارفع صورة الشارت، ثم اضغط الفحص لقراءة إشارة مبنية على بيانات السوق
            الحية.
          </span>
        )}
      </div>

      <p className="demo-note">
        <span aria-hidden="true">ℹ️</span>
        <span>
          تُقرأ بكسلات الصورة داخل جهازك (بدون رفعها لأي خادم) لاستخراج الاتجاه والقمم والقيعان
          وموقع السعر، ثم تُدمج مع بيانات السوق الحية لإصدار إشارة فورية مباشرة (CALL أو PUT) مع نسبة
          الثقة والمدة المقترحة. نسبة الثقة تقيس قوة الأدلة وليست ضمانًا للربح، ولا تُعد توصية
          استثمارية.
        </span>
      </p>
    </>
  );
}
