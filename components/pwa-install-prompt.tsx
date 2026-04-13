'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

const INSTALL_PROMPT_DISMISSED_STORAGE_KEY = 'evolutionz-fitness:pwa-install-prompt-dismissed'

function getInstallPromptDismissed() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.sessionStorage.getItem(INSTALL_PROMPT_DISMISSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function setInstallPromptDismissed(dismissed: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (dismissed) {
      window.sessionStorage.setItem(INSTALL_PROMPT_DISMISSED_STORAGE_KEY, 'true')
      return
    }

    window.sessionStorage.removeItem(INSTALL_PROMPT_DISMISSED_STORAGE_KEY)
  } catch {
    // Ignore storage failures so the prompt remains functional.
  }
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setIsDismissed(getInstallPromptDismissed())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()

      if (getInstallPromptDismissed()) {
        setInstallEvent(null)
        return
      }

      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPromptDismissed(false)
      setInstallEvent(null)
      setIsDismissed(false)
      setIsInstalling(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  if (!installEvent || isDismissed) {
    return null
  }

  const handleInstall = async () => {
    setIsInstalling(true)

    try {
      await installEvent.prompt()
      await installEvent.userChoice
    } finally {
      setInstallEvent(null)
      setIsInstalling(false)
    }
  }

  const handleDismiss = () => {
    setInstallPromptDismissed(true)
    setInstallEvent(null)
    setIsDismissed(true)
    setIsInstalling(false)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-amber-400/25 bg-[#121212]/95 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="absolute right-3 top-3 text-white/60 hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Dismiss install prompt</span>
      </Button>
      <p className="pr-10 text-sm font-semibold tracking-tight">Install Evolutionz Fitness</p>
      <p className="mt-1 text-sm text-white/70">
        Install the app for faster access and a full-screen experience.
      </p>
      <Button
        type="button"
        onClick={() => void handleInstall()}
        disabled={isInstalling}
        className="mt-3 h-10 w-full bg-amber-400 text-black hover:bg-amber-300"
      >
        <Download className="h-4 w-4" />
        {isInstalling ? 'Opening install prompt...' : 'Install App'}
      </Button>
    </div>
  )
}
