"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny shared preference so muting the sound in one section
 * also silences the other one.
 *
 * Implemented as an external store instead of "setState inside an effect", so
 * every subscriber stays in sync without a cascading re-render on mount.
 */
let enabled = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return enabled;
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value: boolean) {
  if (enabled === value) return;
  enabled = value;
  listeners.forEach((listener) => listener());
}

export function useSoundPreference() {
  const on = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { on, toggle: () => setSoundEnabled(!on) };
}
