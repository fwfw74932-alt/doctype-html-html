"use client";
import React from 'react';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { STRATEGIES, type StrategyId } from "@/lib/strategies";

type Props = {
  value: StrategyId;
  onChange: (value: StrategyId) => void;
  disabled?: boolean;
};

/**
 * Gold dropdown for picking the analysis strategy. Every option carries a
 * short explanation, and the legendary strategy is visually highlighted.
 */
export default function StrategySelect({ value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, STRATEGIES.findIndex((strategy) => strategy.id === value)),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const baseId = useId();

  const selected = STRATEGIES.find((strategy) => strategy.id === value) ?? STRATEGIES[0];

  /** Highlight the current strategy before the menu appears (no state sync in effects). */
  function openMenu() {
    setActiveIndex(Math.max(0, STRATEGIES.findIndex((strategy) => strategy.id === value)));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function commit(index: number) {
    const next = STRATEGIES[index];
    if (next) onChange(next.id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % STRATEGIES.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + STRATEGIES.length) % STRATEGIES.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(STRATEGIES.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className="strategy-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={open ? "strategy-trigger is-open" : "strategy-trigger"}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-list`}
        aria-label="اختر الاستراتيجية"
        aria-activedescendant={open ? `${baseId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="strategy-trigger__value">
          {selected.legendary ? <span aria-hidden="true">👑 </span> : null}
          {selected.label}
        </span>
        <span className={open ? "asset-chevron is-open" : "asset-chevron"} aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <ul className="strategy-menu" id={`${baseId}-list`} role="listbox" aria-label="الاستراتيجيات" ref={menuRef}>
          {STRATEGIES.map((strategy, index) => (
            <li
              key={strategy.id}
              id={`${baseId}-option-${index}`}
              role="option"
              data-index={index}
              aria-selected={strategy.id === value}
              className={[
                "strategy-option",
                index === activeIndex ? "is-active" : "",
                strategy.legendary ? "strategy-option--legendary" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="strategy-option__body">
                <span className="strategy-option__label">
                  {strategy.legendary ? <span aria-hidden="true">👑 </span> : null}
                  {strategy.label}
                </span>
                <span className="strategy-option__desc">{strategy.description}</span>
              </span>
              {strategy.id === value ? (
                <span className="asset-option__check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
