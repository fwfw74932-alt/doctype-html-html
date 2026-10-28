import type { MarketSnapshot } from "@/lib/market";

export async function fetchMarket(
  pair: string,
  timeframe: string,
  strategy: string,
): Promise<MarketSnapshot> {
  const url =
    `/api/market?pair=${encodeURIComponent(pair)}` +
    `&tf=${encodeURIComponent(timeframe)}` +
    `&strategy=${encodeURIComponent(strategy)}`;
  const response = await fetch(url, { cache: "no-store" });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "تعذر جلب بيانات السوق الحية";
    throw new Error(message);
  }

  return payload as MarketSnapshot;
}
