import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { logout } from '../api/auth'

function Logout() {
  const { setMe } = useAuth()
  const navigate = useNavigate()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    logout()
      .catch(() => undefined)
      .finally(() => {
        setMe(null)
        navigate('/login', { replace: true })
      })
  }, [navigate, setMe])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p>Signing out&hellip;</p>
    </div>
  )
}

export default Logout
