/**
 * Built-in training chart. Deterministic, drawn on a canvas in the browser so a
 * visitor without a screenshot can try the full scan path.
 *
 * The path is a textbook setup: a clean uptrend with higher highs / higher lows,
 * a corrective leg into the previous swing low (support), then a bullish
 * rejection candle. It is clearly labelled as a training chart in the UI — it is
 * never presented as live market data.
 */
export function buildSampleChart(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 760;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, "#0a1120");
  background.addColorStop(1, "#060b14");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(148,163,184,0.14)";
  ctx.lineWidth = 1;
  for (let y = 30; y < canvas.height; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const closes: number[] = [];
  let price = 300;
  const push = (count: number, delta: number) => {
    for (let index = 0; index < count; index += 1) {
      price += delta;
      closes.push(price);
    }
  };

  push(24, 1.6); // base advance
  push(8, 1.8); // impulse 1
  push(4, -1.5); // higher low 1
  push(8, 1.8); // impulse 2
  push(4, -1.5); // higher low 2
  push(8, 1.8); // impulse 3
  push(3, -1.5); // higher low 3
  push(6, -1.9); // corrective leg back into the last higher low (support)
  closes.push(price + 3.9); // bullish rejection close off support

  const min = Math.min(...closes) - 6;
  const max = Math.max(...closes) + 6;
  const slot = canvas.width / closes.length;
  const y = (value: number) => 26 + ((max - value) / (max - min)) * (canvas.height - 52);

  closes.forEach((close, index) => {
    const open = index ? closes[index - 1] : close - 1.5;
    const bullish = close >= open;
    const bodyTop = y(Math.max(open, close));
    const bodyBottom = y(Math.min(open, close));
    const wickUp = index === closes.length - 1 ? 3 : 5;
    const wickDown = index === closes.length - 1 ? 14 : 5;
    const x = index * slot + slot / 2;

    ctx.strokeStyle = bullish ? "#26a69a" : "#ef5350";
    ctx.fillStyle = bullish ? "#26a69a" : "#ef5350";
    ctx.beginPath();
    ctx.moveTo(x, bodyTop - wickUp);
    ctx.lineTo(x, bodyBottom + wickDown);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillRect(
      x - (slot - 3) / 2,
      bodyTop,
      Math.max(4, slot - 3),
      Math.max(4, bodyBottom - bodyTop),
    );
  });

  return canvas.toDataURL("image/png");
}
