export type StrategyId = "sr" | "cross" | "trendline" | "legendary";

export type Strategy = {
  id: StrategyId;
  label: string;
  short: string;
  description: string;
  legendary?: boolean;
};

export const STRATEGIES: readonly Strategy[] = [
  {
    id: "sr",
    label: "الدعم والمقاومة",
    short: "S&R",
    description: "ارتداد من الدعم أو رفض من المقاومة على الشموع الحقيقية.",
  },
  {
    id: "cross",
    label: "تقاطع المؤشرات (RSI & EMAs)",
    short: "RSI/EMA",
    description: "تقاطع EMA 9/21 مع فلترة RSI للتشبع الشرائي أو البيعي.",
  },
  {
    id: "trendline",
    label: "خط الاتجاه",
    short: "Trendline",
    description: "انحدار خط الانحدار الخطي على آخر الشموع مع قياس جودة الخط.",
  },
  {
    id: "legendary",
    label: "استراتيجية أبو ناصر الأسطورية",
    short: "Legendary",
    description: "دمج الاستراتيجيات الثلاث مع الزخم وATR في خوارزمية توافق واحدة.",
    legendary: true,
  },
];

export function isStrategy(value: string): value is StrategyId {
  return STRATEGIES.some((strategy) => strategy.id === value);
}

export function findStrategy(value: string): Strategy {
  return STRATEGIES.find((strategy) => strategy.id === value) ?? STRATEGIES[3];
}
