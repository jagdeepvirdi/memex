import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { initTheme, useResolvedTheme } from './lib/theme'
import { clearLegacyApiCache } from './lib/pwaCache'

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

// Start cleanup before mounting so legacy API data is removed early without blocking the offline shell.
void clearLegacyApiCache()
registerSW({ immediate: true })
initTheme()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
      <ThemedToaster />
    </MotionConfig>
  </React.StrictMode>,
)
