import { request } from './client'

export interface AppConfig {
  demoMode: boolean
  // Minutes between demo resets, when the server exposes it. Absent means the
  // banner falls back to static copy rather than inventing a number.
  demoResetMinutes?: number
}

export function getConfig(signal?: AbortSignal): Promise<AppConfig> {
  return request('/config', { signal })
}
