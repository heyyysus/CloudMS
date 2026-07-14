import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './components/layout/app-layout'
import Home from './pages/Home'
import Login from './pages/Login'
import Logout from './pages/Logout'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/logout" element={<Logout />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<Home />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
