"use client";
import React from 'react';

import { useState } from "react";

import { BRAND_NAME, LOGO_URL } from "@/lib/brand";

type Props = {
  size?: number;
  variant?: "default" | "large";
  eager?: boolean;
  className?: string;
};

/**
 * Circular gold-framed brand emblem built from the uploaded ABO NASER logo.
 * Falls back to a gold monogram if the image cannot load.
 */
export default function BrandMark({ size = 40, variant = "default", eager = false, className }: Props) {
  const [failed, setFailed] = useState(false);
  const classes = ["brand-mark", variant === "large" ? "brand-mark--large" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`شعار ${BRAND_NAME}`}
    >
      {failed ? (
        <svg className="brand-mark__fallback" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M6 54 24 12l14 30 6-13 14 25h-9l-5-9-6 13-6-13-8 17z" />
        </svg>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={LOGO_URL}
          alt=""
          width={size}
          height={size}
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
