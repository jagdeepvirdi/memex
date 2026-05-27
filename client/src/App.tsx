import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAuthStore } from './store/authStore'
import Dashboard from './pages/Dashboard'
import Category from './pages/Category'
import Item from './pages/Item'
import Vault from './pages/Vault'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Trash from './pages/Trash'
import SemanticGraph from './pages/SemanticGraph'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen w-full bg-bg text-ink font-body">
          <Routes>
            <Route path="/login" element={<Login />} />
            
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
            <Route path="/trash" element={
              <ProtectedRoute><Trash /></ProtectedRoute>
            } />
            <Route path="/graph" element={
              <ProtectedRoute><SemanticGraph /></ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute><Settings /></ProtectedRoute>
            } />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
