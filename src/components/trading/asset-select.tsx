"use client";
import React from 'react';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type Props = {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
};

/**
 * Accessible, gold-styled dropdown for choosing the trading pair.
 * Follows the listbox popup pattern: the trigger keeps focus while open and
 * exposes the highlighted option through aria-activedescendant.
 */
export default function AssetSelect({ options, value, onChange, label, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.indexOf(value)));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const baseId = useId();

  /** Highlight the current value before the menu appears (no state sync in effects). */
  function openMenu() {
    setActiveIndex(Math.max(0, options.indexOf(value)));
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
    const next = options[index];
    if (next) onChange(next);
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
        setActiveIndex((index) => (index + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
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
    <div className="asset-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={open ? "asset-trigger is-open" : "asset-trigger"}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-list`}
        aria-label={label}
        aria-activedescendant={open ? `${baseId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="asset-trigger__value">
          <span className={value.startsWith("XAU") ? "asset-dot asset-dot--metal" : "asset-dot"} />
          {value}
        </span>
        <span className={open ? "asset-chevron is-open" : "asset-chevron"} aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <ul className="asset-menu" id={`${baseId}-list`} role="listbox" aria-label={label} ref={menuRef}>
          {options.map((option, index) => (
            <li
              key={option}
              id={`${baseId}-option-${index}`}
              role="option"
              data-index={index}
              aria-selected={option === value}
              className={
                index === activeIndex ? "asset-option is-active" : "asset-option"
              }
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className={option.startsWith("XAU") ? "asset-dot asset-dot--metal" : "asset-dot"} />
              <span className="asset-option__name">{option}</span>
              {option === value ? (
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
