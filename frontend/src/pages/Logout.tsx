import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { logout } from '../api/auth'

function Logout() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    logout()
      .catch(() => undefined)
      .finally(() => {
        setUser(null)
        navigate('/login', { replace: true })
      })
  }, [navigate, setUser])

  return (
    <section id="center" className="auth-page">
      <p>Signing out&hellip;</p>
    </section>
  )
}

export default Logout
