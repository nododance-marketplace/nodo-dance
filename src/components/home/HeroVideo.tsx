'use client'

import { useEffect, useRef } from 'react'

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    video.play().catch(() => {})
  }, [])

  return (
    <video
      ref={ref}
      src="/header-nodo.mp4"
      poster="/header-nodo-poster.jpg"
      muted
      loop
      playsInline
      preload="metadata"
      aria-label="Earth from space where the Nodo dancer emblem forms and connects the partner dance styles of the world"
      {...({ 'webkit-playsinline': 'true' } as Record<string, string>)}
    />
  )
}
