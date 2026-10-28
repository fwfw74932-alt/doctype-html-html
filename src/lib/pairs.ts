export const PAIRS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CAD",
  "EUR/GBP",
  "EUR/JPY",
  "NZD/USD",
  "USD/CHF",
  "XAU/USD",
] as const;

export type Pair = (typeof PAIRS)[number];

/** Yahoo Finance tickers: FX pairs as XXXYYY=X, gold as COMEX futures GC=F. */
export const YAHOO_SYMBOL: Record<Pair, string> = {
  "EUR/USD": "EURUSD=X",
  "GBP/USD": "GBPUSD=X",
  "USD/JPY": "USDJPY=X",
  "AUD/USD": "AUDUSD=X",
  "USD/CAD": "USDCAD=X",
  "EUR/GBP": "EURGBP=X",
  "EUR/JPY": "EURJPY=X",
  "NZD/USD": "NZDUSD=X",
  "USD/CHF": "USDCHF=X",
  "XAU/USD": "GC=F",
};

export function isPair(value: string): value is Pair {
  return (PAIRS as readonly string[]).includes(value);
}
