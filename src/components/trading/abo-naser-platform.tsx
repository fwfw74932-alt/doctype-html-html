"use client";
import React from 'react';

import { useEffect, useState, type KeyboardEvent } from "react";

import BrandMark from "@/components/trading/brand-mark";
import ChartPanel from "@/components/trading/chart-panel";
import GuideSection from "@/components/trading/guide-section";
import PredictionPanel from "@/components/trading/prediction-panel";
import SiteBackdrop from "@/components/trading/site-backdrop";
import { BRAND_TAGLINE } from "@/lib/brand";

const TABS = [
  { id: "prediction", label: "التنبؤ بالشمعة المستقبلية" },
  { id: "chart", label: "تصوير وتحليل الشارت" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AboNaserPlatform() {
  const [tab, setTab] = useState<TabId>("prediction");

  // Deep links: #chart opens the chart photographer, #prediction the forecast.
  useEffect(() => {
    function applyHash() {
      const hash = window.location.hash.replace("#", "");
      if (hash === "chart" || hash === "chart-demo") setTab("chart");
      if (hash === "prediction") setTab("prediction");
      if (new URLSearchParams(window.location.search).get("demo") === "chart") setTab("chart");
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = TABS.findIndex((item) => item.id === tab);
    const step = event.key === "ArrowLeft" ? 1 : -1;
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <main className="platform">
      <SiteBackdrop />

      <div className="platform-inner">
        <header className="brand-card">
          <span className="brand-crest" aria-hidden="true" />
          <div className="brand-emblem-row">
            <BrandMark size={96} variant="large" eager />
          </div>
          <p className="logo-badge">👑 ABO NASER OFFICIAL VIP 👑</p>
          <h1 className="brand-title">منصة أبو ناصر الذكية</h1>
          <p className="brand-subtitle">نظام التنبؤ السيبراني وقراءة السوق الحية</p>
          <p className="watermark">إدارة: أبو ناصر ({BRAND_TAGLINE})</p>
        </header>

        <div className="nav-tabs" role="tablist" aria-label="أقسام المنصة" onKeyDown={onTabKey}>
          {TABS.map((item) => (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              className="nav-tab"
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
            >
              <BrandMark size={24} />
              {item.label}
            </button>
          ))}
        </div>

        <div className={tab === "prediction" ? "section-box is-active" : "section-box"}>
          <div id="panel-prediction" role="tabpanel" aria-labelledby="tab-prediction" tabIndex={0}>
            <h2 className="section-title">
              <BrandMark size={26} /> قسم التنبؤ بالشمعة المستقبلية (Cyber AI)
            </h2>
            <PredictionPanel />
            <p className="watermark" style={{ marginTop: 16 }}>
              {BRAND_TAGLINE} TECH
            </p>
          </div>
        </div>

        <div className={tab === "chart" ? "section-box is-active" : "section-box"}>
          <div id="panel-chart" role="tabpanel" aria-labelledby="tab-chart" tabIndex={0}>
            <h2 className="section-title">
              <BrandMark size={26} /> قسم تصوير وتحليل الشارت (Market AI)
            </h2>
            <ChartPanel />
            <p className="watermark" style={{ marginTop: 16 }}>
              ABO NASER VISION
            </p>
          </div>
        </div>

        <GuideSection />

        <footer className="site-footer">
          <BrandMark size={54} />
          <p className="site-footer__name">{BRAND_TAGLINE}</p>
          <p className="site-footer__note">
            جميع الحقوق محفوظة © — تحليل مبني على بيانات سوق حية، وليس توصية استثمارية.
          </p>
        </footer>
      </div>
    </main>
  );
}
