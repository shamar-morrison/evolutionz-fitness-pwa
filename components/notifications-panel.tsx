'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  archiveClearableNotifications,
  archiveNotification,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  useNotifications,
} from '@/hooks/use-notifications'
import { useIsMobile } from '@/hooks/use-mobile'
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

function getReviewHref(type: string) {
  if (type === 'reschedule_request') {
    return '/pending-approvals/reschedule-requests'
  }

  if (type === 'status_change_request') {
    return '/pending-approvals/session-updates'
  }

  return null
}

export function NotificationsPanel() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile, loading } = useAuth()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null)
  const [archivingNotificationId, setArchivingNotificationId] = useState<string | null>(null)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
  const [isArchivingAll, setIsArchivingAll] = useState(false)
  const profileId = profile?.id ?? ''
  const { notifications, unreadCount, error } = useNotifications(profileId)

  if (loading || !profile) {
    return null
  }

  const profileRole = profile.role
  const unreadBadgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)
  const hasClearableNotifications = notifications.some((notification) =>
    isNotificationArchivable(notification, profileRole),
  )

  const invalidateQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(profileId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount(profileId) }),
    ])
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
      await invalidateQueries()
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
      await invalidateQueries()
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

  return (
    <Drawer open={open} onOpenChange={setOpen} direction={isMobile ? 'bottom' : 'right'}>
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
            ? 'max-h-[85vh] w-full overflow-hidden rounded-t-3xl p-0'
            : 'h-full w-full overflow-hidden p-0 sm:max-w-lg'
        }
      >
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <DrawerHeader className="gap-4 px-4 py-4 sm:px-5 !text-left">
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
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleClearAll()}
                disabled={!hasClearableNotifications || isArchivingAll || archivingNotificationId !== null}
              >
                <X className="h-4 w-4" />
                Clear All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
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
          </DrawerHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-5 sm:pb-6">
          {error ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load notifications.'}
            </p>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => {
                const reviewHref = getReviewHref(notification.type)
                const handleSelect = () =>
                  void handleNotificationClick(notification.id, notification.read)
                const isArchivable = isNotificationArchivable(notification, profileRole)
                const showArchiveButton = isArchivable
                const archiveButtonVisibilityClass =
                  isMobile || archivingNotificationId === notification.id
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'

                return (
                  <div
                    key={notification.id}
                    role="button"
                    tabIndex={0}
                    onClick={handleSelect}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleSelect()
                      }
                    }}
                    className={`group relative w-full rounded-2xl border px-4 py-4 text-left shadow-sm transition-colors ${
                      notification.read ? 'bg-background' : 'bg-amber-50/70'
                    }`}
                  >
                    {showArchiveButton ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        loading={archivingNotificationId === notification.id}
                        disabled={
                          isArchivingAll ||
                          (archivingNotificationId !== null &&
                            archivingNotificationId !== notification.id)
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
                      <div className={`min-w-0 space-y-1.5 ${showArchiveButton ? 'pr-10' : ''}`}>
                        <p
                          className={`text-sm ${notification.read ? 'font-medium' : 'font-semibold'}`}
                        >
                          {notification.title}
                        </p>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {notification.body}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!notification.read && busyNotificationId !== notification.id ? (
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
                            router.push(reviewHref)
                          }}
                        >
                          Review
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
