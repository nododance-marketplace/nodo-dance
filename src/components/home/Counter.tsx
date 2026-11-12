'use client'

import { useEffect, useRef } from 'react'

interface CounterProps {
  value: number
  prefix?: string
  suffix?: string
  /** Animation length in ms */
  duration?: number
}

/**
 * Odometer-style number for the homepage proof band.
 *
 * The final value renders on the server, so no-JS visitors and screen
 * readers see the real number immediately. With motion allowed, the count
 * runs once — rAF-driven, ease-out cubic — when the number scrolls into
 * view. Reduced motion keeps the final value, always.
 */
export function Counter({ value, prefix = '', suffix = '', duration = 1500 }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const format = (n: number) => `${prefix}${Math.round(n).toLocaleString('en-US')}${suffix}`
    let raf = 0

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1)
          const eased = 1 - Math.pow(1 - t, 3)
          node.textContent = format(value * eased)
          if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.6 }
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, prefix, suffix, duration])

  return (
    <span ref={ref} className="home-proof-number">
      {`${prefix}${value.toLocaleString('en-US')}${suffix}`}
    </span>
  )
}
