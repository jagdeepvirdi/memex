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
import PendingItems from './pages/PendingItems'
import EnrichedItems from './pages/EnrichedItems'
import TableView from './pages/TableView'
import PlacesView from './pages/PlacesView'
import MediaView from './pages/MediaView'
import SemanticGraph from './pages/SemanticGraph'
import Welcome from './pages/Welcome'
import AskMemex from './pages/AskMemex'

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
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
