import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

export function useAiStatus() {
  const [aiStatus, setAiStatus] = useState<'ok' | 'error' | 'loading'>('loading')
  const [enrichment, setEnrichment] = useState<{ pending: number; total: number } | null>(null)
  const [eta, setEta] = useState<string | null>(null)
  const [rate, setRate] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  const startTimeRef = useRef<number | null>(null)
  const startPendingRef = useRef<number | null>(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const checkOllama = () => {
      apiFetch<{ status: string }>('/health/ollama')
        .then(res => setAiStatus(res.status as 'ok' | 'error'))
        .catch(() => setAiStatus('error'))
    }
    checkOllama()
    const ollamaInterval = setInterval(checkOllama, 30_000)

    let prevPending = -1
    const checkEnrichment = async () => {
      try {
        const data = await apiFetch<{ pending: number; total: number }>('/items/enrichment')
        if (data.total > 0) {
          setEnrichment(data)
          if (data.pending > 0) {
            if (startTimeRef.current === null) {
              startTimeRef.current = Date.now()
              startPendingRef.current = data.pending
            } else {
              const elapsedSec = (Date.now() - startTimeRef.current) / 1000
              const done = startPendingRef.current! - data.pending
              if (done > 0 && elapsedSec > 0) {
                const perSec = done / elapsedSec
                setRate(`${(perSec * 60).toFixed(1)} notes/min`)
                setEta(formatDuration(data.pending / perSec))
              }
            }
          } else {
            startTimeRef.current = null
            startPendingRef.current = null
            setEta(null)
            setRate(null)
          }
          // Signal sidebar to refresh category counts
          if (prevPending > 0 && data.pending < prevPending) {
            window.dispatchEvent(new Event('memex:categories-changed'))
          }
          prevPending = data.pending
        } else {
          setEnrichment(null)
        }
      } catch {
        // non-critical
      }
    }
    checkEnrichment()
    const enrichInterval = setInterval(checkEnrichment, 5_000)

    return () => {
      clearInterval(ollamaInterval)
      clearInterval(enrichInterval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { aiStatus, enrichment, eta, rate, isOnline }
}
