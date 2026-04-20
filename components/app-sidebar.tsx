'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BanknoteIcon,
  CalendarDays,
  Check,
  ClipboardList,
  ClipboardCheck,
  DoorOpen,
  History,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Pencil,
  Settings,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { usePendingApprovalCounts } from '@/hooks/use-pending-approval-counts'
import { usePermissions } from '@/hooks/use-permissions'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { toast } from '@/hooks/use-toast'
import { getAuthenticatedHomePath } from '@/lib/auth-redirect'
import { createClient } from '@/lib/supabase/client'
import { isRouteAllowed } from '@/lib/route-config'
import { formatStaffTitles, isFrontDeskStaff } from '@/lib/staff'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
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
  { href: '/email', label: 'Send Email', icon: Mail },
  { href: '/classes', label: 'Classes', icon: GraduationCap },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/door-history', label: 'Door History', icon: History },
]

const adminReportItems: NavItem[] = [
  { href: '/reports/pt-payments', label: 'PT Trainer Payments', icon: BarChart3 },
  { href: '/reports/class-payments', label: 'Group Class Payments', icon: BarChart3 },
  { href: '/reports/members', label: 'Member Reports', icon: BarChart3 },
  { href: '/reports/revenue', label: 'Revenue Reports', icon: BarChart3 },
]

const adminApprovalItems: NavItem[] = [
  {
    href: '/pending-approvals/member-requests',
    label: 'Member Requests',
    icon: ClipboardCheck,
  },
  {
    href: '/pending-approvals/edit-requests',
    label: 'Edit Requests',
    icon: Pencil,
  },
  {
    href: '/pending-approvals/payment-requests',
    label: 'Payment Requests',
    icon: BanknoteIcon,
  },
  {
    href: '/pending-approvals/class-registration-requests',
    label: 'Class Requests',
    icon: GraduationCap,
  },
  {
    href: '/pending-approvals/extension-requests',
    label: 'Extension Requests',
    icon: CalendarDays,
  },
  {
    href: '/pending-approvals/pause-requests',
    label: 'Pause Requests',
    icon: CalendarDays,
  },
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
  { href: '/members', label: 'Members', icon: Users },
  { href: '/trainer/requests', label: 'My Requests', icon: ClipboardList },
]

const frontDeskNavItems: NavItem[] = [
  { href: '/members', label: 'Members', icon: Users },
  { href: '/classes', label: 'Classes', icon: GraduationCap },
]

const trainerClassesNavItems: NavItem[] = [{ href: '/classes', label: 'Classes', icon: GraduationCap }]

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
  const { can } = usePermissions()
  const { isMobile, setOpenMobile } = useSidebar()
  const [unlockState, setUnlockState] = useState<'idle' | 'unlocking' | 'unlocked'>('idle')
  const [isSigningOut, setIsSigningOut] = useState(false)
  const isAdmin = role === 'admin'
  const { counts: pendingApprovalCounts } = usePendingApprovalCounts({
    enabled: isAdmin,
  })
  const staffTitles = profile?.titles ?? []
  const isFrontDesk = isFrontDeskStaff(staffTitles)
  const trainerPrimaryNavItems = trainerNavItems.filter((item) =>
    isRouteAllowed(item.href, 'staff', staffTitles),
  )
  const frontDeskPrimaryNavItems = frontDeskNavItems.filter((item) =>
    isRouteAllowed(item.href, 'staff', staffTitles),
  )
  const trainerSecondaryNavItems = trainerClassesNavItems.filter((item) =>
    isRouteAllowed(item.href, 'staff', staffTitles),
  )
  const navItems =
    role === 'staff'
      ? isFrontDesk
        ? frontDeskPrimaryNavItems
        : trainerPrimaryNavItems
      : adminNavItems
  const secondaryNavItems = role === 'staff' && !isFrontDesk ? trainerSecondaryNavItems : []
  const homeHref = getAuthenticatedHomePath(role, staffTitles)
  const workspaceLabel = role === 'staff' && !isFrontDesk ? 'Trainer' : 'Application'
  const workspaceSubtitle =
    role === 'admin'
      ? 'Admin workspace'
      : isFrontDesk
        ? 'Front desk workspace'
        : 'Trainer workspace'
  const displayName = profile?.name ?? user?.email ?? 'Account'
  const subtitle = profile ? formatStaffTitles(profile.titles) || 'Signed in' : user?.email ?? null
  const userEmail = profile?.email ?? user?.email ?? 'No email available'

  const handleNavigationClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

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

  const handleSettingsClick = () => {
    handleNavigationClick()
    router.push('/settings')
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Evolutionz Fitness">
              <Link data-progress href={homeHref} onClick={handleNavigationClick}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                  EF
                </div>
                <div className="grid flex-1 text-left text-lg leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold tracking-tight">
                    Evolutionz Fitness
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/65">
                    {workspaceSubtitle}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{workspaceLabel}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link data-progress href={item.href} onClick={handleNavigationClick}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {secondaryNavItems.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Classes</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {secondaryNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, item.href)}
                      tooltip={item.label}
                    >
                      <Link data-progress href={item.href} onClick={handleNavigationClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {can('reports.view') ? (
          <SidebarGroup>
            <SidebarGroupLabel>Reports</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminReportItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, item.href)}
                      tooltip={item.label}
                    >
                      <Link data-progress href={item.href} onClick={handleNavigationClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {isAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>Notifications</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminApprovalItems.map((item) => {
                  const count =
                    item.href === '/pending-approvals/member-requests'
                      ? pendingApprovalCounts.member_approval_requests
                      : item.href === '/pending-approvals/edit-requests'
                      ? pendingApprovalCounts.member_edit_requests
                      : item.href === '/pending-approvals/payment-requests'
                      ? pendingApprovalCounts.member_payment_requests
                      : item.href === '/pending-approvals/class-registration-requests'
                      ? pendingApprovalCounts.class_registration_edit_requests +
                        pendingApprovalCounts.class_registration_removal_requests
                      : item.href === '/pending-approvals/extension-requests'
                      ? pendingApprovalCounts.member_extension_requests
                      : item.href === '/pending-approvals/pause-requests'
                      ? pendingApprovalCounts.member_pause_requests +
                        pendingApprovalCounts.member_pause_resume_requests
                      : item.href === '/pending-approvals/reschedule-requests'
                      ? pendingApprovalCounts.pt_reschedule_requests
                      : pendingApprovalCounts.pt_session_update_requests

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActivePath(pathname, item.href)}
                        tooltip={item.label}
                      >
                        <Link data-progress href={item.href} onClick={handleNavigationClick}>
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
        {can('door.unlock') ? (
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
        ) : null}

        {user && !loading ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    title={displayName}
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-foreground/10 text-sm font-semibold">
                      {getInitials(displayName)}
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-medium">{displayName}</span>
                      <span className="truncate text-xs text-sidebar-foreground/65">
                        {subtitle ?? 'Signed in'}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-56 min-w-56 rounded-lg"
                  side={isMobile ? 'bottom' : 'right'}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex flex-col gap-1 px-2 py-1.5">
                      <p className="truncate text-sm font-medium leading-none">{displayName}</p>
                      <p className="truncate text-xs leading-none text-muted-foreground">
                        {userEmail}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {can('settings.manage') ? (
                    <>
                      <DropdownMenuItem onClick={handleSettingsClick} disabled={isSigningOut}>
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem
                    onClick={() => void handleSignOut()}
                    disabled={isSigningOut}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
