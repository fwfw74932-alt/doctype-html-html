import React from 'react';

import type { ReactNode } from "react";

import BrandMark from "@/components/trading/brand-mark";

export default function GuideSection() {
  return (
    <section className="guide-card" aria-labelledby="guide-heading">
      <h2 className="section-title" id="guide-heading">
        <BrandMark size={26} /> كيفية استعمال منصة أبو ناصر
      </h2>
      <p className="guide-intro">دليلك السريع لاستخدام ميزات المنصة بكفاءة عالية:</p>
      <div className="guide-steps">
        <Step n={1} title="قسم التنبؤ بالشمعة">
          حدد الزوج والإطار الزمني (يُفضّل 5 دقائق أو أعلى لأزواج الفوركس)، ثم اضغط زر التحليل. يقرأ
          المحرك اتجاه الشموع ويظهر فورًا إشارة CALL للاتجاه الصاعد أو PUT للاتجاه الهابط، مع نسبة
          الثقة والمدة المقترحة وعدّاد الدخول — دون قوائم شروط أو انتظار.
        </Step>
        <Step n={2} title="قسم تحليل الشارت">
          انتقل إليه عبر الزر الثاني، ارفع لقطة شاشة للشارت ثم اضغط الفحص. يقرأ المحرك الشموع والقمم
          والقيعان وموقع السعر من الصورة داخل جهازك، ويصدر الإشارة الكبرى مباشرة (صعود أو هبوط) مع
          نسبة الثقة والمدة. شارة «مصدر القرار» توضح هل جاءت الإشارة من الصورة أم من السوق أم من
          تطابقهما.
        </Step>
        <Step n={3} title="العلامة التجارية">
          جميع الأقسام والواجهات تحمل بوضوح شعار وهوية وحقوق ABO NASER TRADING الرسمية.
        </Step>
      </div>
      <p className="watermark">جميع الحقوق محفوظة © ABO NASER TRADING</p>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="step-item">
      <span className="step-num" aria-hidden="true">
        {n}
      </span>
      <p>
        <strong>{title}:</strong> {children}
      </p>
    </div>
  );
}
