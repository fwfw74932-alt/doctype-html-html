"use client";
import React from 'react';

import { useSoundPreference } from "@/lib/sound-preference";

export default function SoundToggle() {
  const { on, toggle } = useSoundPreference();

  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={on}
      aria-label={on ? "كتم المؤثر الصوتي" : "تشغيل المؤثر الصوتي"}
      onClick={toggle}
    >
      <span aria-hidden="true">{on ? "🔊" : "🔇"}</span>
      {on ? "المؤثر الصوتي مفعّل" : "المؤثر الصوتي مكتوم"}
    </button>
  );
}
