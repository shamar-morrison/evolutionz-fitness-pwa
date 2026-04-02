'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { RoleGuard } from '@/components/role-guard'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Calendar,
  Receipt,
  DoorOpen,
  LogOut,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'

type UnlockDoorResponse =
  | {
      ok: true
      jobId: string
      result: unknown
    }
  | {
      ok: false
      jobId?: string
      error: string
    }

async function unlockDoor() {
  const response = await fetch('/api/access/unlock', { method: 'POST' })

  let data: UnlockDoorResponse | null = null

  try {
    data = (await response.json()) as UnlockDoorResponse
  } catch {
    data = null
  }

  if (!response.ok || !data || data.ok === false) {
    throw new Error(data && data.ok === false ? data.error : 'Failed to unlock the door.')
  }
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/check-in', label: 'Check-In', icon: UserCheck },
  { href: '/classes', label: 'Classes', icon: Calendar },
  { href: '/billing', label: 'Billing', icon: Receipt },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const [unlockState, setUnlockState] = useState<'idle' | 'unlocking' | 'unlocked'>('idle')

  const handleUnlock = async () => {
    setUnlockState('unlocking')

    try {
      await unlockDoor()
      setUnlockState('unlocked')
      setTimeout(() => setUnlockState('idle'), 2000)
    } catch (error) {
      setUnlockState('idle')
      toast({
        title: 'Unlock failed',
        description:
          error instanceof Error ? error.message : 'Failed to unlock the door.',
        variant: 'destructive',
      })
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <span className="text-sm font-bold text-primary-foreground">EF</span>
        </div>
        <span className="text-lg font-bold tracking-tight">Evolutionz Fitness</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Unlock Door Button & User Profile */}
      <div className="border-t border-sidebar-border p-3">
        <RoleGuard role="admin">
          <Button
            onClick={handleUnlock}
            disabled={unlockState !== 'idle'}
            className={cn(
              'mb-3 w-full gap-2 text-base font-semibold',
              unlockState === 'unlocked'
                ? 'bg-green-600 hover:bg-green-600'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
            size="lg"
          >
            {unlockState === 'idle' && (
              <>
                <DoorOpen className="h-5 w-5" />
                Unlock Door
              </>
            )}
            {unlockState === 'unlocking' && (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Unlocking...
              </>
            )}
            {unlockState === 'unlocked' && (
              <>
                <Check className="h-5 w-5" />
                Unlocked
              </>
            )}
          </Button>
        </RoleGuard>

        {user && (
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-foreground/10 text-sm font-semibold">
              {getInitials(user.name)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <Badge
                variant="secondary"
                className={cn(
                  'mt-0.5 text-xs uppercase',
                  user.role === 'admin'
                    ? 'bg-primary/20 text-primary'
                    : 'bg-sidebar-foreground/20 text-sidebar-foreground/80'
                )}
              >
                {user.role}
              </Badge>
            </div>
            <button
              onClick={signOut}
              className="rounded-md p-2 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
