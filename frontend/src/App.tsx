import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './components/layout/app-layout'
import { ToastProvider } from './components/ui/toast'
import { createQueryClient } from './lib/query-client'
import Admin from './pages/Admin'
import ClientDetail from './pages/ClientDetail'
import Home from './pages/Home'
import Login from './pages/Login'
import Logout from './pages/Logout'

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
                  <Route path="/admin" element={<Admin />} />
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
