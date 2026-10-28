/**
 * Chart Vision — instant, on-device reading of an uploaded chart screenshot.
 *
 * The image never leaves the browser: it is drawn into an offscreen canvas,
 * every pixel is classified as bullish (green/teal) or bearish (red/crimson)
 * candle ink, and the ink map is then converted into a candle sequence.
 *
 * For each recognised candle we separate the thick body from the thin wick, so
 * the report can describe what the trader actually sees:
 *
 *  - the trend (higher highs / higher lows, bullish dominance, midpoint slope),
 *  - where price sits inside the visible range,
 *  - whether the newest candle is a real rejection (bounce off support) or a
 *    rejection at resistance,
 *  - a volatility irregularity index used by the Volatility Guard.
 *
 * This is geometry, not OCR of price labels, so the report exposes the exact
 * numbers it measured instead of claiming certainty.
 */

export type VisionReport = {
  ok: boolean;
  note: string;
  /** Time spent on pixel analysis, in milliseconds. */
  ms: number;
  width: number;
  height: number;
  /** Number of candle columns the scanner recognised. */
  candles: number;
  /** Share of bullish ink among all recognised candle ink (0..1). */
  bullShare: number;
  /** Recency-weighted direction, -1 (fully bearish) .. 1 (fully bullish). */
  bias: number;
  /** Slope of the newest candles, -1 .. 1. */
  momentum: number;
  /** Irregularity index, 0 (orderly) .. 100 (random / choppy). */
  volatility: number;
  /** Average candle height as a percentage of the analysed chart band. */
  volatilityPct: number;
  /** Support / resistance as a percentage from the top of the image. */
  supportPct: number;
  resistancePct: number;
  /** Where the latest candle sits: 0 = at support, 100 = at resistance. */
  position: number;
  /** Same, but inside the last 20 candles (a pullback reads low here). */
  recentPosition: number;
  trend: "up" | "down" | "flat";
  /** How convincing the trend is, 0..1 (structure + slope + dominance). */
  trendStrength: number;
  trendLabel: string;
  /** Swing structure counts over the recognised candles. */
  structure: { hh: number; hl: number; lh: number; ll: number };
  /** Body share of the newest candle (0..1, 1 = full body, no wicks). */
  lastBody: number;
  /** Lower / upper wick share of the newest candle. */
  lastWickDown: number;
  lastWickUp: number;
  lastBullish: boolean;
  /** Bullish candles among the last five. */
  bullRun: number;
  /** Bullish rejection while sitting at support. */
  bounce: boolean;
  /** Bearish rejection while sitting at resistance. */
  rejection: boolean;
  reasons: string[];
};

const MAX_WIDTH = 640;
/** A recognisable candle is a run of coloured columns narrower than this. */
const MAX_CANDLE_WIDTH = 26;
const MIN_CANDLES = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function empty(note: string, ms: number): VisionReport {
  return {
    ok: false,
    note,
    ms: Math.round(ms),
    width: 0,
    height: 0,
    candles: 0,
    bullShare: 0.5,
    bias: 0,
    momentum: 0,
    volatility: 55,
    volatilityPct: 0,
    supportPct: 100,
    resistancePct: 0,
    position: 50,
    recentPosition: 50,
    trend: "flat",
    trendStrength: 0,
    trendLabel: "غير واضح",
    structure: { hh: 0, hl: 0, lh: 0, ll: 0 },
    lastBody: 0,
    lastWickDown: 0,
    lastWickUp: 0,
    lastBullish: false,
    bullRun: 0,
    bounce: false,
    rejection: false,
    reasons: [],
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("تعذر فتح صورة الشارت"));
    image.src = url;
  });
}

/**
 * Classify one pixel: 1 = bullish ink, 2 = bearish ink, 0 = background/other.
 * Uses hue + saturation so dark backgrounds, grid lines, white text and grey
 * indicator panels are ignored, while teal/green and red/crimson candles pass.
 */
function classify(r: number, g: number, b: number, a: number) {
  if (a < 40) return 0;

  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  const chroma = max - min;

  if (max < 46 || chroma < 34) return 0;

  const saturation = chroma / max;
  if (saturation < 0.22) return 0;

  let hue: number;
  if (max === r) hue = (((g - b) / chroma + 6) % 6) * 60;
  else if (max === g) hue = ((b - r) / chroma + 2) * 60;
  else hue = ((r - g) / chroma + 4) * 60;

  if (hue >= 68 && hue <= 200) return 1;
  if (hue <= 22 || hue >= 328) return 2;
  return 0;
}

type Segment = {
  start: number;
  end: number;
  top: number;
  bottom: number;
  bull: number;
  bear: number;
  width: number;
  /** Thick part of the candle (the body), found after segmentation. */
  bodyTop: number;
  bodyBottom: number;
};

/** Swing-pivot structure over the candle midpoints. */
function swingStructure(mids: number[]) {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let index = 2; index < mids.length - 2; index += 1) {
    if (mids[index] >= mids[index - 1] && mids[index] > mids[index + 1] && mids[index] > mids[index - 2]) {
      highs.push(mids[index]);
    }
    if (mids[index] <= mids[index - 1] && mids[index] < mids[index + 1] && mids[index] < mids[index + 2]) {
      lows.push(mids[index]);
    }
  }

  let hh = 0;
  let lh = 0;
  for (let index = 1; index < highs.length; index += 1) {
    // Screen y grows downward, so a lower y means a higher price.
    if (highs[index] < highs[index - 1]) hh += 1;
    else lh += 1;
  }

  let hl = 0;
  let ll = 0;
  for (let index = 1; index < lows.length; index += 1) {
    if (lows[index] < lows[index - 1]) hl += 1;
    else ll += 1;
  }

  return { hh, hl, lh, ll };
}

export async function analyzeChartImage(url: string): Promise<VisionReport> {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();

  let image: HTMLImageElement;
  try {
    image = await loadImage(url);
  } catch {
    return empty("تعذر فتح صورة الشارت", (typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
  }

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) {
    return empty("الصورة غير صالحة للتحليل", (typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
  }

  const scale = Math.min(1, MAX_WIDTH / naturalWidth);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return empty("محرك تحليل الصور غير متاح في هذا المتصفح", (typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
  }

  ctx.drawImage(image, 0, 0, width, height);

  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return empty("تعذرت قراءة بكسلات الصورة", (typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
  }

  // ---- pass 1: classify ink and build a row histogram -----------------------
  const classes = new Uint8Array(width * height);
  const rowInk = new Int32Array(height);
  let colored = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = rowOffset + x;
      const offset = index * 4;
      const kind = classify(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]);
      if (kind === 0) continue;
      classes[index] = kind;
      rowInk[y] += 1;
      colored += 1;
    }
  }

  const coverage = colored / (width * height);
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  if (coverage < 0.0004) {
    return empty("لم يتم رصد شموع ملوّنة كافية في الصورة — تأكد من وضوح الشارت ودقته", now() - started);
  }

  // ---- isolate the main candle band (ignores volume / indicator sub-panels) --
  let peak = 0;
  let peakRow = 0;
  for (let y = 0; y < height; y += 1) {
    if (rowInk[y] > peak) {
      peak = rowInk[y];
      peakRow = y;
    }
  }

  const threshold = Math.max(2, peak * 0.12);
  let bandTop = peakRow;
  let bandBottom = peakRow;
  while (bandTop > 0 && rowInk[bandTop - 1] >= threshold) bandTop -= 1;
  while (bandBottom < height - 1 && rowInk[bandBottom + 1] >= threshold) bandBottom += 1;

  if (bandBottom - bandTop < 8) {
    bandTop = 0;
    bandBottom = height - 1;
  }

  const bandHeight = Math.max(1, bandBottom - bandTop + 1);

  // ---- pass 2: column profile inside the band -------------------------------
  const bullCol = new Int32Array(width);
  const bearCol = new Int32Array(width);
  const topCol = new Int32Array(width).fill(height);
  const bottomCol = new Int32Array(width).fill(-1);

  for (let y = bandTop; y <= bandBottom; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const kind = classes[rowOffset + x];
      if (kind === 0) continue;
      if (kind === 1) bullCol[x] += 1;
      else bearCol[x] += 1;
      if (y < topCol[x]) topCol[x] = y;
      if (y > bottomCol[x]) bottomCol[x] = y;
    }
  }

  const hasInk = (x: number) => bullCol[x] + bearCol[x] > 0;

  let firstCol = -1;
  let lastCol = -1;
  for (let x = 0; x < width; x += 1) {
    if (hasInk(x)) {
      if (firstCol < 0) firstCol = x;
      lastCol = x;
    }
  }

  if (firstCol < 0 || lastCol - firstCol < 10) {
    return empty("لم يتم التعرف على شريط شموع واضح في الصورة", now() - started);
  }

  // ---- group ink columns into candles (tolerating a one-column gap) ---------
  type Run = { start: number; end: number };
  const runs: Run[] = [];
  let runStart = -1;
  for (let x = firstCol; x <= lastCol; x += 1) {
    if (hasInk(x)) {
      if (runStart < 0) runStart = x;
    } else if (runStart >= 0) {
      runs.push({ start: runStart, end: x - 1 });
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push({ start: runStart, end: lastCol });

  const merged: Run[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && run.start - previous.end <= 2) previous.end = run.end;
    else merged.push({ ...run });
  }

  const buildSegment = (start: number, end: number): Segment | null => {
    let bull = 0;
    let bear = 0;
    let top = height;
    let bottom = -1;

    for (let x = start; x <= end; x += 1) {
      bull += bullCol[x];
      bear += bearCol[x];
      if (topCol[x] < top) top = topCol[x];
      if (bottomCol[x] > bottom) bottom = bottomCol[x];
    }

    if (bottom <= top) return null;
    return {
      start,
      end,
      top,
      bottom,
      bull,
      bear,
      width: end - start + 1,
      bodyTop: top,
      bodyBottom: bottom,
    };
  };

  const directionAt = (x: number) => (bullCol[x] >= bearCol[x] ? 1 : -1);

  // Dense screenshots have almost no gap between candles, so a wide ink run is
  // split wherever the dominant candle colour flips.
  const rawSegments: Segment[] = [];
  for (const run of merged) {
    if (run.end - run.start + 1 <= MAX_CANDLE_WIDTH) {
      const segment = buildSegment(run.start, run.end);
      if (segment) rawSegments.push(segment);
      continue;
    }

    let start = run.start;
    let direction = directionAt(run.start);
    for (let x = run.start + 1; x <= run.end; x += 1) {
      const nextDirection = directionAt(x);
      if (nextDirection !== direction) {
        const segment = buildSegment(start, x - 1);
        if (segment) rawSegments.push(segment);
        start = x;
        direction = nextDirection;
      }
    }
    const tail = buildSegment(start, run.end);
    if (tail) rawSegments.push(tail);
  }

  // Whatever is still too wide is one continuous block of the same colour:
  // slice it using the median width of the candles we already recognised.
  const cleanWidths = rawSegments
    .filter((segment) => segment.width <= MAX_CANDLE_WIDTH)
    .map((segment) => segment.width)
    .sort((a, b) => a - b);
  const medianWidth = cleanWidths.length ? cleanWidths[Math.floor(cleanWidths.length / 2)] : 8;
  const sliceWidth = Math.max(3, medianWidth);

  const segments: Segment[] = [];
  for (const segment of rawSegments) {
    if (segment.width <= MAX_CANDLE_WIDTH) {
      segments.push(segment);
      continue;
    }

    const pieces = Math.max(1, Math.round(segment.width / sliceWidth));
    const step = segment.width / pieces;
    for (let index = 0; index < pieces; index += 1) {
      const start = segment.start + Math.round(index * step);
      const end = Math.min(segment.end, segment.start + Math.round((index + 1) * step) - 1);
      const piece = buildSegment(start, Math.max(start, end));
      if (piece) segments.push(piece);
    }
  }

  if (segments.length < MIN_CANDLES) {
    return empty(
      `تم رصد ${segments.length} شمعة فقط — الصورة غير واضحة بما يكفي للفحص الفوري`,
      now() - started,
    );
  }

  // ---- separate the body from the wick -------------------------------------
  // The body is the thick part of the candle, so it is the run of rows where a
  // large share of the segment's columns carry ink; the rest is the wick.
  for (const segment of segments) {
    const needed = Math.max(2, Math.round(segment.width * 0.55));
    let bodyTop = -1;
    let bodyBottom = -1;

    for (let y = segment.top; y <= segment.bottom; y += 1) {
      const rowOffset = y * width;
      let count = 0;
      for (let x = segment.start; x <= segment.end; x += 1) {
        if (classes[rowOffset + x] !== 0) count += 1;
      }
      if (count >= needed) {
        if (bodyTop < 0) bodyTop = y;
        bodyBottom = y;
      }
    }

    if (bodyTop >= 0 && bodyBottom > bodyTop) {
      segment.bodyTop = bodyTop;
      segment.bodyBottom = bodyBottom;
    }
  }

  // ---- directional bias, weighted towards the newest candles ----------------
  let bullInk = 0;
  let bearInk = 0;
  let weighted = 0;
  let weightSum = 0;

  segments.forEach((segment, index) => {
    bullInk += segment.bull;
    bearInk += segment.bear;

    const distance = segments.length - 1 - index;
    const weight = 0.86 ** distance;
    weightSum += weight;

    const direction = segment.bull >= segment.bear ? 1 : -1;
    weighted += direction * weight;
  });

  const totalInk = bullInk + bearInk;
  const bullShare = totalInk > 0 ? bullInk / totalInk : 0.5;
  const bias = weightSum > 0 ? clamp(weighted / weightSum, -1, 1) : 0;

  // ---- momentum from the vertical midpoints of the newest candles -----------
  const recent = segments.slice(-14);
  const mids = recent.map((segment) => (segment.top + segment.bottom) / 2);
  let slope = 0;
  if (mids.length >= 3) {
    const meanX = (mids.length - 1) / 2;
    const meanY = mids.reduce((sum, value) => sum + value, 0) / mids.length;
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < mids.length; index += 1) {
      numerator += (index - meanX) * (mids[index] - meanY);
      denominator += (index - meanX) ** 2;
    }
    slope = denominator ? numerator / denominator : 0;
  }

  const averageHeight =
    recent.reduce((sum, segment) => sum + (segment.bottom - segment.top), 0) / Math.max(1, recent.length);
  const momentum = clamp(-(slope / Math.max(1, averageHeight)) * 2.2, -1, 1);

  // ---- volatility irregularity ---------------------------------------------
  const heights = segments.map((segment) => segment.bottom - segment.top);
  const heightMean = heights.reduce((sum, value) => sum + value, 0) / heights.length;
  const heightSd = Math.sqrt(
    heights.reduce((sum, value) => sum + (value - heightMean) ** 2, 0) / heights.length,
  );
  const coefficient = heightMean > 0 ? heightSd / heightMean : 0;

  let flips = 0;
  for (let index = 1; index < segments.length; index += 1) {
    const previousUp = segments[index - 1].bull >= segments[index - 1].bear;
    const currentUp = segments[index].bull >= segments[index].bear;
    if (previousUp !== currentUp) flips += 1;
  }
  const flipRatio = segments.length > 1 ? flips / (segments.length - 1) : 0;

  const volatility = Math.round(
    clamp(coefficient * 62 + flipRatio * 52 + (segments.length < 14 ? 8 : 0), 0, 100),
  );
  const volatilityPct = round((heightMean / bandHeight) * 100, 2);

  // ---- support / resistance from the analysed band --------------------------
  const highestTop = Math.min(...segments.map((segment) => segment.top));
  const lowestBottom = Math.max(...segments.map((segment) => segment.bottom));
  const lastMid = mids[mids.length - 1] ?? (bandTop + bandBottom) / 2;
  const span = Math.max(1, lowestBottom - highestTop);
  // position: 0 at support (bottom of the band), 100 at resistance (top).
  const position = Math.round(clamp((1 - (lastMid - highestTop) / span) * 100, 0, 100));

  const supportPct = Math.round(((lowestBottom - bandTop) / bandHeight) * 100);
  const resistancePct = Math.round(((highestTop - bandTop) / bandHeight) * 100);

  // ---- trend read: structure over the whole chart, not just the last bars --
  const allMids = segments.map((segment) => (segment.top + segment.bottom) / 2);
  const structure = swingStructure(allMids);
  const pivots = structure.hh + structure.hl + structure.lh + structure.ll;
  const structureScore = pivots
    ? clamp((structure.hh + structure.hl - structure.lh - structure.ll) / pivots, -1, 1)
    : 0;

  // Slope of the whole visible move (first third vs last third), so a normal
  // pullback cannot flip the trend read.
  const third = Math.max(1, Math.floor(allMids.length / 3));
  const earlyAvg = allMids.slice(0, third).reduce((sum, value) => sum + value, 0) / third;
  const lateAvg =
    allMids.slice(-third).reduce((sum, value) => sum + value, 0) / Math.max(1, third);
  const longSlope = clamp((-(lateAvg - earlyAvg)) / Math.max(1, averageHeight * 6), -1, 1);

  const dominance = segments.slice(-30);
  const dominanceBull = dominance.length
    ? dominance.filter((segment) => segment.bull >= segment.bear).length / dominance.length
    : 0.5;
  const dominanceScore = dominanceBull * 2 - 1;

  const trendScore = clamp(longSlope * 0.4 + structureScore * 0.38 + dominanceScore * 0.22, -1, 1);
  const trendStrength = Math.round(clamp(Math.abs(trendScore) * 1.25, 0, 1) * 100) / 100;
  const trend = trendScore > 0.12 ? "up" : trendScore < -0.12 ? "down" : "flat";
  const trendLabel =
    trend === "flat"
      ? "عرضي"
      : `${trend === "up" ? "صاعد" : "هابط"} ${trendStrength >= 0.62 ? "قوي" : trendStrength >= 0.42 ? "واضح" : "ضعيف"}`;

  // ---- newest candle anatomy: body, wicks and rejection --------------------
  const last = segments[segments.length - 1];
  const lastRange = Math.max(1, last.bottom - last.top);
  const lastBody = (last.bodyBottom - last.bodyTop) / lastRange;
  // Screen y grows downward: the lower wick reaches below the body.
  const lastWickDown = (last.bottom - last.bodyBottom) / lastRange;
  const lastWickUp = (last.bodyTop - last.top) / lastRange;
  const lastBullish = last.bull >= last.bear;
  const bullRun = segments.slice(-5).filter((segment) => segment.bull >= segment.bear).length;

  const recentWindow = segments.slice(-20);
  const recentHigh = Math.min(...recentWindow.map((segment) => segment.top));
  const recentLow = Math.max(...recentWindow.map((segment) => segment.bottom));
  const recentSpan = Math.max(1, recentLow - recentHigh);
  const recentPosition = Math.round(clamp((1 - (lastMid - recentHigh) / recentSpan) * 100, 0, 100));

  const bounce = lastBullish && recentPosition <= 45 && lastWickDown >= 0.2;
  const rejection = !lastBullish && recentPosition >= 55 && lastWickUp >= 0.2;

  const reasons = [
    `تم رصد ${segments.length} شمعة داخل الشارت (تحليل بكسل محلي في ${Math.round(now() - started)}ms)`,
    `الاتجاه ${trendLabel} · بنية ${structure.hh} قمة صاعدة / ${structure.hl} قاع صاعد مقابل ${structure.lh} قمة هابطة / ${structure.ll} قاع هابط`,
    `السيطرة الشرائية ${Math.round(bullShare * 100)}% مقابل ${Math.round((1 - bullShare) * 100)}% بيعية (آخر 5 شموع: ${bullRun} صاعدة)`,
    `موقع السعر ${position}% من النطاق العام · ${recentPosition}% داخل آخر 20 شمعة (0 = دعم · 100 = مقاومة)`,
    bounce
      ? "شمعة ارتداد صاعدة من منطقة الدعم"
      : rejection
        ? "شمعة رفض هابطة عند منطقة المقاومة"
        : recentPosition <= 45
          ? "السعر في الجزء السفلي من الحركة الأخيرة — منطقة تصحيح"
          : recentPosition >= 55
            ? "السعر في الجزء العلوي من الحركة الأخيرة — قريب من مقاومة"
            : "السعر داخل النطاق بين الدعم والمقاومة",
  ];

  return {
    ok: true,
    note: "تم تحليل الشموع والمستويات من الصورة",
    ms: Math.round(now() - started),
    width,
    height,
    candles: segments.length,
    bullShare: round(bullShare, 3),
    bias: round(bias, 3),
    momentum: round(momentum, 3),
    volatility,
    volatilityPct,
    supportPct,
    resistancePct,
    position,
    recentPosition,
    trend,
    trendStrength,
    trendLabel,
    structure,
    lastBody: round(lastBody, 3),
    lastWickDown: round(lastWickDown, 3),
    lastWickUp: round(lastWickUp, 3),
    lastBullish,
    bullRun,
    bounce,
    rejection,
    reasons,
  };
}
