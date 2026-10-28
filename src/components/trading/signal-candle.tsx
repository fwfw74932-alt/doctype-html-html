import React from 'react';

type Props = {
  up: boolean;
};

const BACKGROUND_CANDLES = [
  { x: 28, open: 118, close: 98, wickTop: 90, wickBottom: 128 },
  { x: 54, open: 98, close: 108, wickTop: 88, wickBottom: 116 },
  { x: 80, open: 108, close: 86, wickTop: 78, wickBottom: 114 },
  { x: 170, open: 96, close: 80, wickTop: 70, wickBottom: 104 },
  { x: 196, open: 80, close: 70, wickTop: 60, wickBottom: 88 },
  { x: 222, open: 70, close: 82, wickTop: 62, wickBottom: 92 },
];

const GRID_LINES = [44, 82, 120, 158];

const UP_SHAPE = { wickTop: 30, bodyTop: 56, bodyBottom: 112, wickBottom: 138, close: 56 };
const DOWN_SHAPE = { wickTop: 52, bodyTop: 72, bodyBottom: 128, wickBottom: 154, close: 128 };

/**
 * A single, clearly drawn candlestick (real body + wick) that grows in when the
 * signal arrives. Gold for CALL, neon red for PUT.
 */
export default function SignalCandle({ up }: Props) {
  const shape = up ? UP_SHAPE : DOWN_SHAPE;
  const bodyColor = up ? "url(#an-gold-body)" : "url(#an-red-body)";
  const wickColor = up ? "#fdf3c9" : "#ff9fb0";
  const haloColor = up ? "rgba(240, 201, 106, 0.14)" : "rgba(255, 47, 87, 0.14)";
  const levelColor = up ? "rgba(240, 201, 106, 0.45)" : "rgba(255, 47, 87, 0.45)";

  return (
    <svg
      className="signal-chart"
      viewBox="0 0 250 190"
      role="img"
      aria-label={
        up
          ? "شمعة تداول صاعدة متوقعة مرسومة بالجسم والفتيل باللون الذهبي"
          : "شمعة تداول هابطة متوقعة مرسومة بالجسم والفتيل باللون الأحمر النيون"
      }
    >
      <defs>
        <linearGradient id="an-gold-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdf3c9" />
          <stop offset="45%" stopColor="#f0c96a" />
          <stop offset="100%" stopColor="#b8873a" />
        </linearGradient>
        <linearGradient id="an-red-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff7b90" />
          <stop offset="55%" stopColor="#ff2f57" />
          <stop offset="100%" stopColor="#a50f2c" />
        </linearGradient>
      </defs>

      <rect x="102" y="8" width="44" height="174" rx="8" fill="rgba(240, 201, 106, 0.05)" />

      {GRID_LINES.map((y) => (
        <line
          key={y}
          x1="8"
          x2="242"
          y1={y}
          y2={y}
          stroke="rgba(240, 201, 106, 0.09)"
          strokeWidth="1"
        />
      ))}

      {BACKGROUND_CANDLES.map((candle) => {
        const top = Math.min(candle.open, candle.close);
        const height = Math.max(Math.abs(candle.close - candle.open), 4);
        return (
          <g key={candle.x}>
            <line
              x1={candle.x}
              x2={candle.x}
              y1={candle.wickTop}
              y2={candle.wickBottom}
              stroke="rgba(240, 201, 106, 0.26)"
              strokeWidth="1.5"
            />
            <rect
              x={candle.x - 6}
              y={top}
              width="12"
              height={height}
              rx="1.5"
              fill="rgba(240, 201, 106, 0.2)"
            />
          </g>
        );
      })}

      <line
        className="candle-close-line"
        x1="86"
        x2="242"
        y1={shape.close}
        y2={shape.close}
        stroke={levelColor}
        strokeWidth="1"
        strokeDasharray="4 5"
      />

      <g className={up ? "candle" : "candle candle--down"}>
        <ellipse
          className="candle-halo"
          cx="124"
          cy={(shape.bodyTop + shape.bodyBottom) / 2}
          rx="42"
          ry="60"
          fill={haloColor}
        />
        <line
          className="candle-wick"
          x1="124"
          x2="124"
          y1={shape.wickTop}
          y2={shape.wickBottom}
          stroke={wickColor}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <rect
          className={up ? "candle-body" : "candle-body candle-body--down"}
          x="111"
          y={shape.bodyTop}
          width="26"
          height={shape.bodyBottom - shape.bodyTop}
          rx="3"
          fill={bodyColor}
        />
        <circle
          className="candle-tip"
          cx="124"
          cy={shape.close}
          r="3.4"
          fill={up ? "#fdf3c9" : "#ff9fb0"}
        />
      </g>
    </svg>
  );
}
