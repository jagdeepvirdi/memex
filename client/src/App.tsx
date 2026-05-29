import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAuthStore } from './store/authStore'
import { fetchDueReminders, setReminder } from './lib/api'
import Dashboard from './pages/Dashboard'
import Category from './pages/Category'
import Item from './pages/Item'
import Vault from './pages/Vault'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Trash from './pages/Trash'
import PendingItems from './pages/PendingItems'
import EnrichedItems from './pages/EnrichedItems'
import TableView from './pages/TableView'
import PlacesView from './pages/PlacesView'
import MediaView from './pages/MediaView'
import SemanticGraph from './pages/SemanticGraph'
import Welcome from './pages/Welcome'
import AskMemex from './pages/AskMemex'
import CategoryReview from './pages/CategoryReview'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function ReminderPoller() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return

    // Request notification permission once on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const fire = async () => {
      if (!isAuthenticated || Notification.permission !== 'granted') return
      try {
        const due = await fetchDueReminders()
        for (const item of due) {
          const n = new Notification('Memex Reminder', {
            body: item.title,
            icon: '/pwa-192x192.png',
            tag: item.id,
          })
          n.onclick = () => {
            window.focus()
            window.location.href = `/item/${item.id}`
          }
          // Clear the reminder so it doesn't fire again
          setReminder(item.id, null).catch(() => {})
        }
      } catch {
        // Never crash the app over a reminder poll failure
      }
    }

    fire() // check immediately on mount
    const interval = setInterval(fire, 60_000) // then every minute
    return () => clearInterval(interval)
  }, [isAuthenticated])

  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <ReminderPoller />
      <BrowserRouter>
        <div className="min-h-screen w-full bg-bg text-ink font-body">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/welcome" element={
              <ProtectedRoute><Welcome /></ProtectedRoute>
            } />
            <Route path="/ask" element={
              <ProtectedRoute><AskMemex /></ProtectedRoute>
            } />
            <Route path="/" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/category/:id" element={
              <ProtectedRoute><Category /></ProtectedRoute>
            } />
            <Route path="/item/:id" element={
              <ProtectedRoute><Item /></ProtectedRoute>
            } />
            <Route path="/vault" element={
              <ProtectedRoute><Vault /></ProtectedRoute>
            } />
            <Route path="/items/pending" element={
              <ProtectedRoute><PendingItems /></ProtectedRoute>
            } />
            <Route path="/items/enriched" element={
              <ProtectedRoute><EnrichedItems /></ProtectedRoute>
            } />
            <Route path="/items/table" element={
              <ProtectedRoute><TableView /></ProtectedRoute>
            } />
            <Route path="/places" element={
              <ProtectedRoute><PlacesView /></ProtectedRoute>
            } />
            <Route path="/media" element={
              <ProtectedRoute><MediaView /></ProtectedRoute>
            } />
            <Route path="/trash" element={
              <ProtectedRoute><Trash /></ProtectedRoute>
            } />
            <Route path="/graph" element={
              <ProtectedRoute><SemanticGraph /></ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute><Settings /></ProtectedRoute>
            } />
            <Route path="/categories/review" element={
              <ProtectedRoute><CategoryReview /></ProtectedRoute>
            } />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
