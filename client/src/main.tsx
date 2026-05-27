import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster 
      position="bottom-right" 
      theme="dark" 
      toastOptions={{
        style: { 
          background: '#1A1A1A', 
          border: '1px solid rgba(255,255,255,0.05)',
          color: '#E6E4D5',
          fontFamily: 'DM Sans, sans-serif'
        },
      }}
    />
  </React.StrictMode>,
)
