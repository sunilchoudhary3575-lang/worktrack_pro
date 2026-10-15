/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    invoke: (channel: string, payload?: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }>
    on: (channel: string, callback: (data: unknown) => void) => () => void
    platform: string
  }
  __hostname__?: string
}
