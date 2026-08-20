import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { AppLayout } from './components/layout/app-layout'
import { ToastProvider } from './components/ui/toast'
import { createQueryClient } from './lib/query-client'
import Admin from './pages/Admin'
import ClientDetail from './pages/ClientDetail'
import CorrespondenceTemplates from './pages/CorrespondenceTemplates'
import ReminderRules from './pages/ReminderRules'
import Home from './pages/Home'
import Login from './pages/Login'
import Logout from './pages/Logout'
import ManageCarriers from './pages/ManageCarriers'
import ManageUsers from './pages/ManageUsers'
import TrustAccounting from './pages/TrustAccounting'

function App() {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/logout" element={<Logout />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route path="/home" element={<Home />} />
                  <Route path="/clients/:clientId" element={<ClientDetail />} />
                  <Route element={<RequireRole role="admin" />}>
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/users" element={<ManageUsers />} />
                    <Route path="/admin/carriers" element={<ManageCarriers />} />
                    <Route path="/admin/correspondence" element={<CorrespondenceTemplates />} />
                    <Route path="/admin/reminders" element={<ReminderRules />} />
                    <Route path="/admin/trust-accounting" element={<TrustAccounting />} />
                  </Route>
                </Route>
              </Route>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
