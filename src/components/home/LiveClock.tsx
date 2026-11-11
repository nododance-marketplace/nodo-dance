'use client'

import { useEffect, useState } from 'react'

export function LiveClock() {
  const [time, setTime] = useState<string | null>(null)

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  return <span className="drop-clock">{time ?? '--:--:--'}</span>
}
