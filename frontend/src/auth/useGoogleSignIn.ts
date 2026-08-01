import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '../components/theme-provider'

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

/** GIS caps the rendered button at 400px. */
const MAX_BUTTON_WIDTH = 400
/** GIS renders its iframe ~20px wider than the requested `width`; keep it inside the container. */
const GSI_IFRAME_CHROME = 20
/** Quiet period after the iframe loads, covering the placeholder removal that follows it. */
const SETTLE_QUIET_MS = 200
/** Backstop quiet period, for when the iframe's load event fired before we could listen. */
const SETTLE_FALLBACK_QUIET_MS = 900
/** Hard cap, so the button is always revealed even if GIS keeps churning. */
const SETTLE_TIMEOUT_MS = 3000

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In script')))
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Sign-In script'))
    document.head.appendChild(script)
  })
}

/**
 * GIS renders the button in two stages: `renderButton` immediately paints a locally-styled
 * placeholder button *and* an iframe holding the real one, then — once that iframe loads —
 * removes the placeholder. That removal is the visible "the button changed" moment, and it
 * lands several hundred ms after the initial paint.
 *
 * This waits for the swap to finish so the container can stay hidden until then. GIS gives us
 * no completion signal, so we settle on the earliest of three heuristics:
 *   1. the iframe's `load` event, plus a short quiet period for the removal that follows it;
 *   2. a longer quiet period, for when that load event fired before we could subscribe;
 *   3. a hard timeout, so the button is never left invisible.
 *
 * Calls `onSettled` once; returns a disposer.
 */
function whenRenderSettled(el: HTMLElement, onSettled: () => void): () => void {
  let quietTimer: ReturnType<typeof setTimeout>
  let hardTimer: ReturnType<typeof setTimeout>
  let watched: HTMLIFrameElement | undefined
  let done = false

  const dispose = () => {
    clearTimeout(quietTimer)
    clearTimeout(hardTimer)
    observer.disconnect()
  }

  const finish = () => {
    if (done) return
    done = true
    dispose()
    onSettled()
  }

  const armQuiet = (ms: number) => {
    clearTimeout(quietTimer)
    quietTimer = setTimeout(finish, ms)
  }

  const watchIframe = () => {
    const iframe = el.querySelector('iframe')
    if (!iframe || iframe === watched) return
    watched = iframe
    iframe.addEventListener('load', () => armQuiet(SETTLE_QUIET_MS), { once: true })
  }

  const observer = new MutationObserver(() => {
    watchIframe()
    armQuiet(SETTLE_FALLBACK_QUIET_MS)
  })

  observer.observe(el, { childList: true, subtree: true })
  watchIframe()
  armQuiet(SETTLE_FALLBACK_QUIET_MS)
  hardTimer = setTimeout(finish, SETTLE_TIMEOUT_MS)

  return dispose
}

export function useGoogleSignIn(onCredential: (idToken: string) => void) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { resolvedTheme } = useTheme()
  const onCredentialRef = useRef(onCredential)
  onCredentialRef.current = onCredential

  // A callback ref rather than a ref object: the effect must not run until the node
  // actually exists. Login renders `null` while auth is loading, so a `[]`-dep effect
  // could otherwise fire with no container and silently never render the button.
  const buttonRef = useCallback((node: HTMLDivElement | null) => setContainer(node), [])

  useEffect(() => {
    if (!container) return

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      setError('Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).')
      return
    }

    let cancelled = false
    let disposeSettleWatch: (() => void) | undefined

    setReady(false)

    loadGsiScript()
      .then(() => {
        if (cancelled) return

        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => onCredentialRef.current(response.credential),
        })

        // Render into a clean container so a re-run (theme change, fast refresh) can
        // never stack two buttons.
        container.replaceChildren()

        // GIS renders its iframe wider than the width we ask for, so budget for that
        // rather than letting the button overhang the card.
        const measured = Math.round(container.clientWidth) - GSI_IFRAME_CHROME

        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: resolvedTheme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          // Pinning the width stops GIS from rendering at one size and displaying at
          // another, which is what left the settled button looking low-res.
          ...(measured > 0 ? { width: Math.min(MAX_BUTTON_WIDTH, measured) } : {}),
        })

        disposeSettleWatch = whenRenderSettled(container, () => {
          if (!cancelled) setReady(true)
        })
      })
      .catch(() => {
        if (!cancelled) setError('Could not load Google Sign-In. Check your connection and try again.')
      })

    return () => {
      cancelled = true
      disposeSettleWatch?.()
      container.replaceChildren()
    }
  }, [container, resolvedTheme])

  return { buttonRef, ready, error }
}
