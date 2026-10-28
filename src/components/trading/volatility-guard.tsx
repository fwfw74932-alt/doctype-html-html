import React from 'react';

import type { GuardState } from "@/lib/instant-scan";

type Props = {
  guard: GuardState;
  /** Compact variant for the prediction section header area. */
  compact?: boolean;
};

const ICONS: Record<GuardState["level"], string> = {
  stable: "🛡️",
  caution: "⚠️",
  danger: "⛔",
};

/**
 * Volatility Guard banner — filters out random / choppy charts before the
 * trader acts. Announced assertively only when execution is suspended.
 */
export default function VolatilityGuard({ guard, compact = false }: Props) {
  const className = [
    "guard",
    `guard--${guard.level}`,
    compact ? "guard--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      role={guard.level === "danger" ? "alert" : "status"}
      aria-live={guard.level === "danger" ? "assertive" : "polite"}
    >
      <span className="guard__icon" aria-hidden="true">
        {ICONS[guard.level]}
      </span>

      <div className="guard__body">
        <p className="guard__title">{guard.title}</p>
        <p className="guard__message">{guard.message}</p>
        <div
          className="guard__meter"
          role="progressbar"
          aria-label="مؤشر عشوائية التذبذب"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={guard.irregularity}
        >
          <span style={{ width: `${guard.irregularity}%` }} />
        </div>
      </div>

      <span className="guard__value">
        <b>{guard.irregularity}</b>
        <span>عشوائية</span>
      </span>
    </div>
  );
}
