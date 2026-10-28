import React from 'react';

import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ABO NASER TRADING | VIP CYBER PLATFORM",
  description:
    "منصة أبو ناصر الذكية: تنبؤ سيبراني مبني على بيانات سوق حية للفوركس والذهب مع إشارات CALL / PUT.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
