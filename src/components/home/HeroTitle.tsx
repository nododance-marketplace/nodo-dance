'use client'

import { motion, useReducedMotion } from 'motion/react'

interface Word {
  text: string
  shimmer?: boolean
}

const LINE_ONE: Word[] = [{ text: 'Find' }, { text: 'your' }]
const LINE_TWO: Word[] = [{ text: 'next' }, { text: 'dance.', shimmer: true }]

export function HeroTitle() {
  const reduced = useReducedMotion()

  const renderLine = (words: Word[], lineIndex: number) => (
    <span className="hero-line" key={lineIndex}>
      {words.map((word, i) => (
        <span className="hero-word" key={i}>
          <motion.span
            className={word.shimmer ? 'hero-shimmer' : undefined}
            initial={reduced ? false : { y: '115%' }}
            animate={{ y: '0%' }}
            transition={{
              type: 'spring',
              stiffness: 110,
              damping: 19,
              delay: 0.06 + (lineIndex * 2 + i) * 0.09,
            }}
          >
            {word.text}
          </motion.span>
        </span>
      ))}
    </span>
  )

  return <h1>{renderLine(LINE_ONE, 0)}{renderLine(LINE_TWO, 1)}</h1>
}
