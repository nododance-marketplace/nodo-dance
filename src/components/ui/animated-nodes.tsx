'use client'

import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  isAccent: boolean
}

export function AnimatedNodes() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<Node[]>([])
  const animationFrameRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

      // Re-initialize nodes on resize
      initNodes()
    }

    const initNodes = () => {
      // Responsive node count: 12-18 desktop, 8-12 mobile
      const isMobile = canvas.offsetWidth < 768
      const minNodes = isMobile ? 8 : 12
      const maxNodes = isMobile ? 12 : 18
      const nodeCount = Math.floor(Math.random() * (maxNodes - minNodes + 1)) + minNodes

      nodesRef.current = Array.from({ length: nodeCount }, (_, i) => ({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3, // Slow drift
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2.5 + 2.5, // 2.5-5px radius
        isAccent: i < 3, // First 3 nodes have accent color
      }))
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)

      const nodes = nodesRef.current
      const isMobile = canvas.offsetWidth < 768
      const connectionDistance = isMobile ? 110 : 140

      // Draw connections first (behind nodes)
      nodes.forEach((node1, i) => {
        nodes.slice(i + 1).forEach((node2) => {
          const dx = node2.x - node1.x
          const dy = node2.y - node1.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < connectionDistance) {
            ctx.beginPath()
            ctx.moveTo(node1.x, node1.y)
            ctx.lineTo(node2.x, node2.y)

            // Opacity based on distance (more visible)
            const opacity = (1 - distance / connectionDistance) * 0.18
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
        })
      })

      // Update and draw nodes
      nodes.forEach((node) => {
        // Update position
        node.x += node.vx
        node.y += node.vy

        // Bounce off edges with gentle damping
        if (node.x < 0 || node.x > canvas.offsetWidth) {
          node.vx *= -1
          node.x = Math.max(0, Math.min(canvas.offsetWidth, node.x))
        }
        if (node.y < 0 || node.y > canvas.offsetHeight) {
          node.vy *= -1
          node.y = Math.max(0, Math.min(canvas.offsetHeight, node.y))
        }

        // Draw node
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)

        if (node.isAccent) {
          // Gradient accent nodes (coral/magenta/orange)
          const gradient = ctx.createRadialGradient(
            node.x, node.y, 0,
            node.x, node.y, node.radius * 3
          )
          gradient.addColorStop(0, 'rgba(255, 111, 97, 0.4)') // coral
          gradient.addColorStop(0.5, 'rgba(194, 24, 91, 0.25)') // magenta
          gradient.addColorStop(1, 'rgba(255, 140, 66, 0.1)') // orange
          ctx.fillStyle = gradient
          ctx.fill()

          // Bright core
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255, 111, 97, 0.7)'
          ctx.fill()
        } else {
          // White nodes with subtle glow
          ctx.shadowBlur = 10
          ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
          ctx.fill()
          ctx.shadowBlur = 0
        }
      })

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.85 }}
    />
  )
}
