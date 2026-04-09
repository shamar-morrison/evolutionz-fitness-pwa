'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallEvent(null)
      setIsInstalling(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  if (!installEvent) {
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

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-amber-400/25 bg-[#121212]/95 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <p className="text-sm font-semibold tracking-tight">Install Evolutionz Fitness</p>
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
