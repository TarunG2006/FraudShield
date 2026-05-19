import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Alerts from './pages/Alerts'
import Rules from './pages/Rules'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e2433',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '13px',
            fontFamily: 'IBM Plex Mono, monospace',
          },
          success: { iconTheme: { primary: '#34d399', secondary: '#1e2433' } },
          error:   { iconTheme: { primary: '#f87171', secondary: '#1e2433' } },
          duration: 3000,
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"    element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/alerts"       element={<Alerts />} />
            <Route path="/rules"        element={<Rules />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}