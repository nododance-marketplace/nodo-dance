'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'

export function HeroEmblem() {
  const frameRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [7, -7]), { stiffness: 130, damping: 17 })
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-8, 8]), { stiffness: 130, damping: 17 })

  const handleMove = (event: React.MouseEvent) => {
    if (reduced) return
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5)
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5)
  }

  const handleLeave = () => {
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <div
      ref={frameRef}
      className="community-symbol"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <motion.div
        style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
      >
        <Image src="/emblem.png" alt="Nodo's connected partner dancers" width={2000} height={2000} priority />
      </motion.div>
    </div>
  )
}
