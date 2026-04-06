'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { normalizeNotification, type Notification } from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'

type NotificationRow = {
  id: string
  recipient_id: string
  type: Notification['type']
  title: string
  body: string
  read: boolean
  metadata: Record<string, unknown> | null
  created_at: string
}

type NotificationInsertPayload = {
  new: {
    type?: string
  } | null
}

async function fetchNotifications(profileId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, type, title, body, read, metadata, created_at')
    .eq('recipient_id', profileId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    throw new Error(`Failed to load notifications: ${error.message}`)
  }

  return ((data ?? []) as NotificationRow[])
    .map((row) =>
      normalizeNotification({
        id: row.id,
        recipientId: row.recipient_id,
        type: row.type,
        title: row.title,
        body: row.body,
        read: row.read,
        metadata: row.metadata,
        createdAt: row.created_at,
      }),
    )
    .filter((notification): notification is Notification => Boolean(notification))
}

async function fetchUnreadCount(profileId: string) {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', profileId)
    .eq('read', false)

  if (error) {
    throw new Error(`Failed to load unread notification count: ${error.message}`)
  }

  return count ?? 0
}

export async function markNotificationAsRead(profileId: string, id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', profileId)
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to mark the notification as read: ${error.message}`)
  }
}

export async function markAllNotificationsAsRead(profileId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', profileId)
    .eq('read', false)

  if (error) {
    throw new Error(`Failed to mark notifications as read: ${error.message}`)
  }
}

export function useNotifications(profileId: string) {
  const queryClient = useQueryClient()

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.all(profileId),
    queryFn: () => fetchNotifications(profileId),
    enabled: Boolean(profileId),
    staleTime: 0,
  })

  const unreadCountQuery = useQuery({
    queryKey: queryKeys.notifications.unreadCount(profileId),
    queryFn: () => fetchUnreadCount(profileId),
    enabled: Boolean(profileId),
    staleTime: 0,
  })

  useEffect(() => {
    if (!profileId) {
      return
    }

    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:${profileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profileId}`,
        },
        (payload: NotificationInsertPayload) => {
          const notificationType =
            typeof payload.new === 'object' && payload.new !== null && 'type' in payload.new
              ? String(payload.new.type)
              : null

          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(profileId) })
          void queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.unreadCount(profileId),
          })

          if (notificationType === 'reschedule_request') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.rescheduleRequests.all })
            void queryClient.invalidateQueries({ queryKey: queryKeys.rescheduleRequests.pending })
          }

          if (
            notificationType === 'reschedule_request' ||
            notificationType === 'reschedule_approved' ||
            notificationType === 'reschedule_denied'
          ) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.rescheduleRequests.mine(profileId),
            })
            void queryClient.invalidateQueries({
              queryKey: queryKeys.ptScheduling.sessions({}),
              exact: false,
            })
          }

          if (notificationType === 'status_change_request') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessionUpdateRequests.all })
            void queryClient.invalidateQueries({
              queryKey: queryKeys.sessionUpdateRequests.pending,
            })
          }

          if (
            notificationType === 'status_change_request' ||
            notificationType === 'status_change_approved' ||
            notificationType === 'status_change_denied'
          ) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.sessionUpdateRequests.mine(profileId),
            })
            void queryClient.invalidateQueries({
              queryKey: queryKeys.ptScheduling.sessions({}),
              exact: false,
            })
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profileId, queryClient])

  return {
    notifications: notificationsQuery.data ?? [],
    unreadCount: unreadCountQuery.data ?? 0,
    isLoading: notificationsQuery.isLoading,
    isUnreadCountLoading: unreadCountQuery.isLoading,
    error: notificationsQuery.error ?? unreadCountQuery.error ?? null,
    refresh: async () => {
      await Promise.all([notificationsQuery.refetch(), unreadCountQuery.refetch()])
    },
  }
}
