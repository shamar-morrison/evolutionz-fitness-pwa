'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  archiveClearableNotifications,
  archiveNotification,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  useArchivedNotifications,
  useNotifications,
} from '@/hooks/use-notifications'
import { useIsMobile } from '@/hooks/use-mobile'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { toast } from '@/hooks/use-toast'
import { isNotificationArchivable } from '@/lib/notification-archive'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type NotificationTab = 'inbox' | 'archived'

function getReviewHref(type: string) {
  if (type === 'reschedule_request') {
    return '/pending-approvals/reschedule-requests'
  }

  if (type === 'member_create_request') {
    return '/pending-approvals/member-requests'
  }

  if (type === 'member_edit_request') {
    return '/pending-approvals/edit-requests'
  }

  if (type === 'member_payment_request') {
    return '/pending-approvals/payment-requests'
  }

  if (type === 'status_change_request') {
    return '/pending-approvals/session-updates'
  }

  return null
}

export function NotificationsPanel() {
  const router = useProgressRouter()
  const queryClient = useQueryClient()
  const { profile, loading } = useAuth()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<NotificationTab>('inbox')
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null)
  const [archivingNotificationId, setArchivingNotificationId] = useState<string | null>(null)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
  const [isArchivingAll, setIsArchivingAll] = useState(false)
  const profileId = profile?.id ?? ''
  const { notifications, unreadCount, error } = useNotifications(profileId)
  const {
    notifications: archivedNotifications,
    isLoading: isArchivedNotificationsLoading,
    error: archivedNotificationsError,
  } = useArchivedNotifications(profileId, open && activeTab === 'archived')

  if (loading || !profile) {
    return null
  }

  const profileRole = profile.role
  const unreadBadgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)
  const hasClearableNotifications = notifications.some((notification) =>
    isNotificationArchivable(notification, profileRole),
  )
  const isInboxTab = activeTab === 'inbox'

  const invalidateQueries = async ({ includeArchived = false }: { includeArchived?: boolean } = {}) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(profileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount(profileId) }),
    ]

    if (includeArchived) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.archived(profileId) }),
      )
    }

    await Promise.all(invalidations)
  }

  const handleNotificationClick = async (notificationId: string, alreadyRead: boolean) => {
    if (alreadyRead) {
      return
    }

    setBusyNotificationId(notificationId)

    try {
      await markNotificationAsRead(profileId, notificationId)
      await invalidateQueries()
    } catch (notificationError) {
      toast({
        title: 'Notification update failed',
        description:
          notificationError instanceof Error
            ? notificationError.message
            : 'Failed to update the notification.',
        variant: 'destructive',
      })
    } finally {
      setBusyNotificationId(null)
    }
  }

  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true)

    try {
      await markAllNotificationsAsRead(profileId)
      await invalidateQueries()
    } catch (notificationError) {
      toast({
        title: 'Mark all failed',
        description:
          notificationError instanceof Error
            ? notificationError.message
            : 'Failed to mark notifications as read.',
        variant: 'destructive',
      })
    } finally {
      setIsMarkingAllRead(false)
    }
  }

  const handleArchiveNotification = async (notificationId: string) => {
    setArchivingNotificationId(notificationId)

    try {
      await archiveNotification(profileId, notificationId, profileRole)
      await invalidateQueries({ includeArchived: true })
    } catch (notificationError) {
      toast({
        title: 'Archive failed',
        description:
          notificationError instanceof Error
            ? notificationError.message
            : 'Failed to archive the notification.',
        variant: 'destructive',
      })
    } finally {
      setArchivingNotificationId(null)
    }
  }

  const handleClearAll = async () => {
    setIsArchivingAll(true)

    try {
      await archiveClearableNotifications(profileId, profileRole)
      await invalidateQueries({ includeArchived: true })
    } catch (notificationError) {
      toast({
        title: 'Clear all failed',
        description:
          notificationError instanceof Error
            ? notificationError.message
            : 'Failed to archive notifications.',
        variant: 'destructive',
      })
    } finally {
      setIsArchivingAll(false)
    }
  }

  const renderNotificationCard = (notification: (typeof notifications)[number], archived = false) => {
    const reviewHref = archived ? null : getReviewHref(notification.type)
    const handleSelect = () => {
      if (archived) {
        return
      }

      void handleNotificationClick(notification.id, notification.read)
    }
    const isArchivable = !archived && isNotificationArchivable(notification, profileRole)
    const archiveButtonVisibilityClass =
      isMobile || archivingNotificationId === notification.id
        ? 'pointer-events-auto opacity-100'
        : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'

    return (
      <div
        key={notification.id}
        role={archived ? undefined : 'button'}
        tabIndex={archived ? undefined : 0}
        onClick={archived ? undefined : handleSelect}
        onKeyDown={
          archived
            ? undefined
            : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleSelect()
                }
              }
        }
        className={`group relative w-full rounded-2xl border px-4 py-4 text-left shadow-sm transition-colors ${
          archived || notification.read ? 'bg-background' : 'bg-amber-50/70'
        }`}
      >
        {isArchivable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            loading={archivingNotificationId === notification.id}
            disabled={
              isArchivingAll ||
              (archivingNotificationId !== null && archivingNotificationId !== notification.id)
            }
            aria-label={`Archive ${notification.title}`}
            className={`absolute right-3 top-3 z-10 rounded-full bg-background/80 ${archiveButtonVisibilityClass}`}
            onClick={async (event) => {
              event.preventDefault()
              event.stopPropagation()
              await handleArchiveNotification(notification.id)
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div className={`min-w-0 space-y-1.5 ${isArchivable ? 'pr-10' : ''}`}>
            <p className={`text-sm ${archived || notification.read ? 'font-medium' : 'font-semibold'}`}>
              {notification.title}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">{notification.body}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </p>
          </div>
          {!archived && !notification.read && busyNotificationId !== notification.id ? (
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" />
          ) : null}
        </div>

        {reviewHref ? (
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async (event) => {
                event.stopPropagation()
                await handleNotificationClick(notification.id, notification.read)
                setOpen(false)
                setActiveTab('inbox')
                router.push(reviewHref)
              }}
            >
              Review
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)

    if (!nextOpen) {
      setActiveTab('inbox')
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      direction={isMobile ? 'bottom' : 'right'}
      handleOnly={isMobile}
    >
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative rounded-full"
          aria-label="Open notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
              {unreadBadgeLabel}
            </span>
          ) : null}
        </Button>
      </DrawerTrigger>
      <DrawerContent
        className={
          isMobile
            ? 'h-[85vh] max-h-[85vh] min-h-0 w-full overflow-hidden rounded-t-3xl p-0'
            : 'h-full w-full overflow-hidden p-0 sm:max-w-lg'
        }
      >
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as NotificationTab)}
          className="min-h-0 flex flex-1 flex-col gap-0"
        >
          <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
            <DrawerHeader className="gap-4 px-4 py-4 sm:px-5 text-left!">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <DrawerTitle className="text-base">Notifications</DrawerTitle>
                  <DrawerDescription>
                    Recent updates for your PT workflow and assignments.
                  </DrawerDescription>
                </div>
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mr-2 shrink-0 rounded-full"
                    aria-label="Close notifications"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
              <div className="flex flex-col gap-3">
                <TabsList className="w-full">
                  <TabsTrigger value="inbox" className="flex-1">Inbox</TabsTrigger>
                  <TabsTrigger value="archived" className="flex-1">Archived</TabsTrigger>
                </TabsList>
              </div>
            </DrawerHeader>
          </div>

          <TabsContent
            value="inbox"
            className="min-h-0 flex-1 flex flex-col outline-none"
          >
            <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5 sm:py-6">
              {error ? (
                <p className="text-sm text-destructive">
                  {error instanceof Error ? error.message : 'Failed to load notifications.'}
                </p>
              ) : notifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No notifications yet.
                </div>
              ) : (
                <div className="space-y-3">{notifications.map((notification) => renderNotificationCard(notification))}</div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 border-t bg-background/95 px-4 py-4 backdrop-blur sm:px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div className="flex flex-row items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => void handleClearAll()}
                  disabled={
                    !hasClearableNotifications || isArchivingAll || archivingNotificationId !== null
                  }
                >
                  <X className="h-4 w-4" />
                  Clear All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => void handleMarkAllRead()}
                  disabled={
                    isMarkingAllRead ||
                    unreadCount === 0 ||
                    isArchivingAll ||
                    archivingNotificationId !== null
                  }
                >
                  <CheckCheck className="h-4 w-4" />
                  Mark all as read
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="archived"
            className="min-h-0 flex-1 flex flex-col outline-none"
          >
            <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5 sm:py-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {archivedNotificationsError ? (
                <p className="text-sm text-destructive">
                  {archivedNotificationsError instanceof Error
                    ? archivedNotificationsError.message
                    : 'Failed to load archived notifications.'}
                </p>
              ) : isArchivedNotificationsLoading ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Loading archived notifications...
                </div>
              ) : archivedNotifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No archived notifications yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {archivedNotifications.map((notification) => renderNotificationCard(notification, true))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  )
}
