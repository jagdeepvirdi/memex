import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { initTheme, useResolvedTheme } from './lib/theme'

// Register PWA service worker
registerSW({ immediate: true })

initTheme()

function ThemedToaster() {
  const theme = useResolvedTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      toastOptions={{
        style: {
          background: 'rgb(var(--c-surface-2))',
          border: '1px solid rgb(var(--c-overlay) / 0.12)',
          color: 'rgb(var(--c-ink))',
          fontFamily: 'DM Sans, sans-serif',
        },
      }}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <ThemedToaster />
  </React.StrictMode>,
)
