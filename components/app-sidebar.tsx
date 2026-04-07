'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  CalendarDays,
  Check,
  ClipboardList,
  ClipboardCheck,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useProgressRouter } from '@/hooks/use-progress-router'
import {
  useRescheduleRequests,
  useSessionUpdateRequests,
} from '@/hooks/use-pt-scheduling'
import { toast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { formatStaffTitles } from '@/lib/staff'
import { cn } from '@/lib/utils'
import { RoleGuard } from '@/components/role-guard'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

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

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
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

const adminNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/staff', label: 'Staff', icon: Users },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
]

const adminApprovalItems: NavItem[] = [
  {
    href: '/pending-approvals/reschedule-requests',
    label: 'Reschedule Requests',
    icon: CalendarDays,
  },
  {
    href: '/pending-approvals/session-updates',
    label: 'Session Updates',
    icon: ClipboardCheck,
  },
]

const trainerNavItems: NavItem[] = [
  { href: '/trainer/schedule', label: 'My Schedule', icon: CalendarDays },
  { href: '/trainer/clients', label: 'My Clients', icon: Users },
  { href: '/trainer/requests', label: 'My Requests', icon: ClipboardList },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function getBadgeLabel(count: number) {
  return count > 9 ? '9+' : String(count)
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useProgressRouter()
  const { user, profile, role, loading } = useAuth()
  const [unlockState, setUnlockState] = useState<'idle' | 'unlocking' | 'unlocked'>('idle')
  const [isSigningOut, setIsSigningOut] = useState(false)
  const pendingRescheduleRequests = useRescheduleRequests('pending', {
    enabled: role === 'admin',
  })
  const pendingSessionUpdateRequests = useSessionUpdateRequests('pending', {
    enabled: role === 'admin',
  })
  const navItems = role === 'staff' ? trainerNavItems : adminNavItems
  const homeHref = role === 'staff' ? '/trainer/schedule' : '/dashboard'
  const displayName = profile?.name ?? user?.email ?? 'Account'
  const subtitle = profile ? formatStaffTitles(profile.titles) || 'Signed in' : user?.email ?? null

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

  const handleSignOut = async () => {
    const supabase = createClient()
    setIsSigningOut(true)

    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error
      }

      router.push('/login')
      router.refresh()
    } catch (error) {
      toast({
        title: 'Sign out failed',
        description: 'Unable to sign out right now.',
        variant: 'destructive',
      })
      console.error('Failed to sign out:', error)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Evolutionz Fitness">
              <Link data-progress href={homeHref}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                  EF
                </div>
                <div className="grid flex-1 text-left text-lg leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold tracking-tight">
                    Evolutionz Fitness
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/65">
                    {role === 'staff' ? 'Trainer workspace' : 'Admin workspace'}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{role === 'staff' ? 'Trainer' : 'Application'}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link data-progress href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {role === 'admin' ? (
          <SidebarGroup>
            <SidebarGroupLabel>Notifications</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminApprovalItems.map((item) => {
                  const count =
                    item.href === '/pending-approvals/reschedule-requests'
                      ? pendingRescheduleRequests.requests.length
                      : pendingSessionUpdateRequests.requests.length

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActivePath(pathname, item.href)}
                        tooltip={item.label}
                      >
                        <Link data-progress href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count > 0 ? (
                        <SidebarMenuBadge>{getBadgeLabel(count)}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <RoleGuard role="admin">
          <Button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={unlockState !== 'idle'}
            className={cn(
              'mb-3 w-full justify-center gap-2 text-base font-semibold group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
              unlockState === 'unlocked'
                ? 'bg-green-600 hover:bg-green-600'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
            size="lg"
          >
            {unlockState === 'idle' && (
              <>
                <DoorOpen className="h-5 w-5 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Unlock Door</span>
              </>
            )}
            {unlockState === 'unlocking' && (
              <>
                <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="group-data-[collapsible=icon]:hidden">Unlocking...</span>
              </>
            )}
            {unlockState === 'unlocked' && (
              <>
                <Check className="h-5 w-5 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Unlocked</span>
              </>
            )}
          </Button>
        </RoleGuard>

        {user && !loading ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip={displayName}>
                <div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-foreground/10 text-sm font-semibold">
                    {getInitials(displayName)}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">{displayName}</span>
                    <span className="truncate text-xs text-sidebar-foreground/65">
                      {subtitle ?? 'Signed in'}
                    </span>
                  </div>
                </div>
              </SidebarMenuButton>
              <SidebarMenuAction
                aria-label="Sign out"
                title="Sign out"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
              >
                <LogOut className="h-4 w-4" />
              </SidebarMenuAction>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
