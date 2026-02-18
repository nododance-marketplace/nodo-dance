'use client'

import { useState, useEffect, useCallback } from 'react'

export type ViewMode = 'comfortable' | 'compact' | 'tile'

/**
 * Persists a view-mode preference per page key in localStorage.
 * SSR-safe: defaults to `defaultMode` until hydrated.
 */
export function useViewMode(
  storageKey: string,
  defaultMode: ViewMode = 'comfortable'
): { mode: ViewMode; setMode: (m: ViewMode) => void } {
  const [mode, setModeState] = useState<ViewMode>(defaultMode)

  // Read from localStorage after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === 'comfortable' || stored === 'compact' || stored === 'tile') {
        setModeState(stored)
      }
    } catch {
      // localStorage unavailable (SSR, incognito edge-case)
    }
  }, [storageKey])

  const setMode = useCallback(
    (m: ViewMode) => {
      setModeState(m)
      try {
        localStorage.setItem(storageKey, m)
      } catch {
        // ignore
      }
    },
    [storageKey]
  )

  return { mode, setMode }
}
