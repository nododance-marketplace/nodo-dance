'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface RevealProps {
  children: ReactNode
  /** Stagger delay in ms */
  delay?: number
  /** Distance offset in px, defaults to 24 */
  y?: number
  as?: 'div' | 'section' | 'article' | 'li' | 'span'
  className?: string
  style?: CSSProperties
}

export function Reveal({ children, delay = 0, y = 24, as: Tag = 'div', className, style }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible')
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={cn('reveal', className)}
      style={{ '--reveal-y': `${y}px`, '--reveal-delay': `${delay}ms`, ...style } as CSSProperties}
    >
      {children}
    </Tag>
  )
}
