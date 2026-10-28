import { NextResponse } from "next/server";

import { buildSnapshot, findTimeframe, type Candle, type MarketSnapshot } from "@/lib/market";
import { isPair, YAHOO_SYMBOL, type Pair } from "@/lib/pairs";
import { isStrategy, type StrategyId } from "@/lib/strategies";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 12_000;
const FETCH_TIMEOUT_MS = 12_000;
const cache = new Map<string, { at: number; data: MarketSnapshot }>();

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
};

async function loadLive(
  pair: Pair,
  timeframeId: string,
  strategy: StrategyId,
): Promise<MarketSnapshot> {
  const timeframe = findTimeframe(timeframeId);
  const symbol = YAHOO_SYMBOL[pair];
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${timeframe.fetchInterval}&range=${timeframe.range}`;

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`مزود البيانات رفض الطلب (${response.status})`);
  }

  const json = (await response.json()) as YahooChart;
  const result = json.chart?.result?.[0];
  if (!result?.timestamp?.length) {
    throw new Error(json.chart?.error?.description ?? "لم تُرجع بيانات سوق صالحة");
  }

  const quote = result.indicators?.quote?.[0];
  const candles: Candle[] = [];

  result.timestamp.forEach((time, index) => {
    const open = quote?.open?.[index];
    const high = quote?.high?.[index];
    const low = quote?.low?.[index];
    const close = quote?.close?.[index];

    if (
      typeof open === "number" &&
      typeof high === "number" &&
      typeof low === "number" &&
      typeof close === "number" &&
      Number.isFinite(open) &&
      Number.isFinite(close)
    ) {
      candles.push({ t: time * 1000, o: open, h: high, l: low, c: close });
    }
  });

  if (candles.length < 20) {
    throw new Error("بيانات السوق غير كافية لحساب المؤشرات الآن");
  }

  const snapshot = buildSnapshot(
    pair,
    timeframe,
    candles,
    {
      price: result.meta?.regularMarketPrice ?? candles[candles.length - 1].c,
      previousClose:
        result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? candles[candles.length - 2].c,
      updatedAt: Date.now(),
    },
    strategy,
  );

  return { ...snapshot, symbol };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pairParam = url.searchParams.get("pair") ?? "EUR/USD";
  const timeframeParam = url.searchParams.get("tf") ?? "1M";

  if (!isPair(pairParam)) {
    return NextResponse.json({ error: "زوج العملات غير مدعوم" }, { status: 400 });
  }

  const strategyParam = url.searchParams.get("strategy") ?? "legendary";
  if (!isStrategy(strategyParam)) {
    return NextResponse.json({ error: "استراتيجية غير معروفة" }, { status: 400 });
  }

  const timeframe = findTimeframe(timeframeParam);
  const key = `${pairParam}|${timeframe.id}|${strategyParam}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.data);
  }

  try {
    const snapshot = await loadLive(pairParam, timeframe.id, strategyParam);
    cache.set(key, { at: Date.now(), data: snapshot });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذر الاتصال بمزود بيانات السوق";
    return NextResponse.json(
      { error: `تعذر جلب بيانات السوق الحية: ${message}` },
      { status: 502 },
    );
  }
}
