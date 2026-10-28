import React from 'react';

/**
 * Visual cyber scan: sweeping light band, scan line, corner brackets and a
 * technical readout. Purely decorative, so it is hidden from assistive tech.
 */
type Props = {
  asset?: string;
  timeframe?: string;
};

export default function CyberScan({ asset, timeframe }: Props) {
  const readout = [asset, timeframe].filter(Boolean).join(" · ");

  return (
    <div className="scan-overlay" aria-hidden="true">
      <span className="scan-bar" />
      <span className="scan-line" />
      <span className="scan-bracket scan-bracket--tl" />
      <span className="scan-bracket scan-bracket--tr" />
      <span className="scan-bracket scan-bracket--bl" />
      <span className="scan-bracket scan-bracket--br" />
      <span className="scan-progress">
        <span />
      </span>
      <span className="scan-readout">{readout ? `SCANNING · ${readout}` : "SCANNING"}</span>
    </div>
  );
}
