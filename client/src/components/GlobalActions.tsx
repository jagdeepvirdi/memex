import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import IngestPanel from './ingest/IngestPanel'
import SearchModal from './search/SearchModal'
import { toast } from 'sonner'
import { useAuthStore } from '../store/authStore'
import { useOutboxStore } from '../store/outboxStore'
import { pingServer } from '../lib/api'

type CaptureDetail = { url?: string; text?: string }

/** App-wide search and capture surfaces, available from every authenticated route. */
export function GlobalActions() {
  const authenticated = useAuthStore(state => state.isAuthenticated)
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInitialQuery, setSearchInitialQuery] = useState('')
  const [searchInitialTag, setSearchInitialTag] = useState('')
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureDetail, setCaptureDetail] = useState<CaptureDetail>({})
  const captureRef = useRef<HTMLDivElement>(null)

  const clearSharedTarget = useCallback(() => {
    if (!searchParams.has('share')) return
    const next = new URLSearchParams(searchParams)
    ;['share', 'title', 'text', 'url'].forEach(key => next.delete(key))
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const openSearch = useCallback((query = '', tag = '') => { setCaptureOpen(false); setSearchInitialQuery(query); setSearchInitialTag(tag); setSearchOpen(true) }, [])
  const openCapture = useCallback((detail: CaptureDetail = {}) => {
    setSearchOpen(false)
    setCaptureDetail(detail)
    setCaptureOpen(true)
  }, [])
  const closeCapture = useCallback(() => {
    setCaptureOpen(false)
    setCaptureDetail({})
    clearSharedTarget()
  }, [clearSharedTarget])

  useEffect(() => {
    if (!authenticated || ['/login', '/welcome'].includes(location.pathname) || location.pathname.startsWith('/share/')) return
    const onSearch = (event: Event) => { const detail = (event as CustomEvent<{ query?: string; tag?: string }>).detail; openSearch(detail?.query ?? '', detail?.tag ?? '') }
    const onCapture = (event: Event) => openCapture((event as CustomEvent<CaptureDetail>).detail ?? {})
    const onCloseCapture = () => closeCapture()
    window.addEventListener('memex:open-search', onSearch)
    window.addEventListener('memex:open-capture', onCapture)
    window.addEventListener('memex:close-capture', onCloseCapture)
    return () => {
      window.removeEventListener('memex:open-search', onSearch)
      window.removeEventListener('memex:open-capture', onCapture)
      window.removeEventListener('memex:close-capture', onCloseCapture)
    }
  }, [authenticated, closeCapture, location.pathname, openCapture, openSearch])

  useEffect(() => {
    if (!authenticated || ['/login', '/welcome'].includes(location.pathname) || location.pathname.startsWith('/share/')) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (editing || searchOpen || captureOpen || event.altKey || event.ctrlKey || event.metaKey) return
      const key = event.key.toLowerCase()
      if (key === '/') { event.preventDefault(); openSearch() }
      if (key === 'n') { event.preventDefault(); openCapture() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [authenticated, captureOpen, location.pathname, openCapture, openSearch, searchOpen])

  // Something shared to Memex from another app (Android share sheet). With Memex reachable it opens the capture panel as
  // before; when it is not (laptop off, no signal) the link or text goes straight into "Save for later", because the
  // person sharing from another app should not have to do anything more.
  useEffect(() => {
    if (!authenticated || location.pathname !== '/' || searchParams.get('share') !== 'true') return
    const url = searchParams.get('url') || undefined
    const text = searchParams.get('text') || searchParams.get('title') || ''
    const detail: CaptureDetail = { url: url ?? (text.startsWith('http') ? text : undefined), text: url ? undefined : text || undefined }
    const value = (detail.url ?? detail.text ?? '').trim()
    if (!value) { openCapture(detail); return }

    let cancelled = false
    void (async () => {
      const reachable = await pingServer()
      if (cancelled) return
      if (reachable) { openCapture(detail); return }
      const saved = await useOutboxStore.getState().add(detail.url ? 'url' : 'text', value)
      if (cancelled) return
      if (saved.ok) {
        toast.success('Memex is not reachable. Saved for later on this phone; it will be sent when Memex answers.')
        clearSharedTarget()
      } else {
        toast.error(saved.message)
        openCapture(detail) // let the person fix or keep it by hand
      }
    })()
    return () => { cancelled = true }
  }, [authenticated, clearSharedTarget, location.pathname, openCapture, searchParams])

  useEffect(() => {
    if (!captureOpen) return
    const previous = document.activeElement as HTMLElement | null
    captureRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeCapture(); return }
      if (event.key !== 'Tab') return
      const items = captureRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
      if (!items?.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [captureOpen, closeCapture])

  if (!authenticated || ['/login', '/welcome'].includes(location.pathname) || location.pathname.startsWith('/share/')) return null

  return <>
    {searchOpen && <SearchModal initialQuery={searchInitialQuery} initialTag={searchInitialTag} onClose={() => { setSearchOpen(false); setSearchInitialQuery(''); setSearchInitialTag('') }} />}
    {captureOpen && <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-bg/80 p-0 sm:p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) closeCapture() }}>
      <div ref={captureRef} role="dialog" aria-modal="true" aria-label="Capture an item" className="w-full max-w-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
        <IngestPanel initialUrl={captureDetail.url} initialText={captureDetail.text} onSuccess={() => { window.dispatchEvent(new Event('memex:categories-changed')); window.dispatchEvent(new Event('memex:item-captured')); closeCapture() }} onCancel={closeCapture} />
      </div>
    </div>}
  </>
}
