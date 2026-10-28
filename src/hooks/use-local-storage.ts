"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

/**
 * localStorage-backed state.
 *
 * The value is read through an external store, so:
 *  - the first render is the server-render-safe `initialValue` (no hydration mismatch),
 *  - updates are picked up across tabs through the `storage` event,
 *  - the hook never calls setState inside an effect.
 */
type Listener = () => void

const listeners = new Map<string, Set<Listener>>()

function notify(key: string) {
  const set = listeners.get(key)
  if (!set) return
  set.forEach((listener) => listener())
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    console.warn(`Error reading localStorage key “${key}”:`, error)
    return null
  }
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((val: T) => T)) => void] {
  const subscribe = useCallback(
    (listener: Listener) => {
      let set = listeners.get(key)
      if (!set) {
        set = new Set<Listener>()
        listeners.set(key, set)
      }
      set.add(listener)

      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) listener()
      }
      window.addEventListener("storage", onStorage)

      return () => {
        set.delete(listener)
        window.removeEventListener("storage", onStorage)
      }
    },
    [key],
  )

  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  )

  const storedValue = useMemo<T>(() => {
    if (raw === null) return initialValue
    try {
      return JSON.parse(raw) as T
    } catch (error) {
      console.warn(`Error parsing localStorage key “${key}”:`, error)
      return initialValue
    }
  }, [raw, initialValue, key])

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
        notify(key)
      } catch (error) {
        console.warn(`Error setting localStorage key “${key}”:`, error)
      }
    },
    [key, storedValue],
  )

  return [storedValue, setValue]
}
