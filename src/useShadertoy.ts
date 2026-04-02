import { useCallback, useEffect, useRef, useState } from 'react'
import { createRenderer, dispose, render } from './renderer'
import type { MouseState, RendererState, UseShadertoyOptions, UseShadertoyReturn } from './types'
import { updateUniforms } from './uniforms'

export function useShadertoy({
  fragmentShader,
  paused = false,
  speed = 1.0,
  pixelRatio,
  mouse: mouseEnabled = true,
  onError,
  onLoad,
}: UseShadertoyOptions): UseShadertoyReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<RendererState | null>(null)
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(paused)
  const speedRef = useRef(speed)

  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mouseState = useRef<MouseState>({
    x: 0, y: 0,
    clickX: 0, clickY: 0,
    pressed: false,
  })

  // Keep refs in sync
  pausedRef.current = paused
  speedRef.current = speed

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const result = createRenderer(canvas, fragmentShader)
    if (typeof result === 'string') {
      setError(result)
      onError?.(result)
      return
    }

    rendererRef.current = result
    setIsReady(true)
    setError(null)
    onLoad?.()

    // Render loop
    let lastTimestamp = 0

    const loop = (timestamp: number) => {
      const delta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0
      lastTimestamp = timestamp

      if (!pausedRef.current && rendererRef.current) {
        updateUniforms(rendererRef.current, delta, speedRef.current, mouseState.current)
        render(rendererRef.current)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (rendererRef.current) {
        dispose(rendererRef.current)
        rendererRef.current = null
      }
      setIsReady(false)
    }
  }, [fragmentShader, onError, onLoad])

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1)

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
      }
    })

    observer.observe(canvas)
    return () => observer.disconnect()
  }, [pixelRatio])

  // Mouse / touch events
  useEffect(() => {
    if (!mouseEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    const toPixel = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect()
      const dpr = pixelRatio ?? window.devicePixelRatio
      return {
        x: (cx - r.left) * dpr,
        y: (r.height - (cy - r.top)) * dpr, // flip Y
      }
    }

    const onMove = (cx: number, cy: number) => {
      if (!mouseState.current.pressed) return
      const { x, y } = toPixel(cx, cy)
      mouseState.current.x = x
      mouseState.current.y = y
    }

    const onDown = (cx: number, cy: number) => {
      const { x, y } = toPixel(cx, cy)
      mouseState.current.x = x
      mouseState.current.y = y
      mouseState.current.clickX = x
      mouseState.current.clickY = y
      mouseState.current.pressed = true
    }

    const onUp = () => {
      mouseState.current.pressed = false
    }

    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const md = (e: MouseEvent) => onDown(e.clientX, e.clientY)
    const mu = () => onUp()
    const tm = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    const ts = (e: TouchEvent) => {
      if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY)
    }
    const te = () => onUp()

    window.addEventListener('mousemove', mm)
    canvas.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    window.addEventListener('touchmove', tm, { passive: true })
    canvas.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchend', te)

    return () => {
      window.removeEventListener('mousemove', mm)
      canvas.removeEventListener('mousedown', md)
      window.removeEventListener('mouseup', mu)
      window.removeEventListener('touchmove', tm)
      canvas.removeEventListener('touchstart', ts)
      window.removeEventListener('touchend', te)
    }
  }, [mouseEnabled, pixelRatio])

  const pause = useCallback(() => { pausedRef.current = true }, [])
  const resume = useCallback(() => { pausedRef.current = false }, [])

  return { canvasRef, isReady, error, pause, resume }
}
