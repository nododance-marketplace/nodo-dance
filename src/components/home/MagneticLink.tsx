'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

interface MagneticLinkProps {
  href: string
  children: React.ReactNode
  className?: string
}

/** Wraps a link so it drifts a few pixels toward the cursor, springing back on leave. */
export function MagneticLink({ href, children, className }: MagneticLinkProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, { stiffness: 220, damping: 18 })
  const y = useSpring(rawY, { stiffness: 220, damping: 18 })

  const handleMove = (event: React.MouseEvent) => {
    if (reduced) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    rawX.set(Math.max(-9, Math.min(9, dx * 0.16)))
    rawY.set(Math.max(-7, Math.min(7, dy * 0.22)))
  }

  const handleLeave = () => {
    rawX.set(0)
    rawY.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={reduced ? undefined : { x, y }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <Link href={href}>{children}</Link>
    </motion.div>
  )
}
