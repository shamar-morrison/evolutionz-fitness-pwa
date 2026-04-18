'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getArchivableNotificationTypes } from '@/lib/notification-archive'
import { normalizeNotification, type Notification } from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

type NotificationRow = {
  id: string
  recipient_id: string
  type: Notification['type']
  title: string
  body: string
  read: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  archived_at?: string | null
}

type NotificationInsertPayload = {
  new: NotificationRealtimeRow | null
}

type NotificationUpdatePayload = {
  old: NotificationRealtimeRow | null
  new: NotificationRealtimeRow | null
}

type NotificationRealtimeRow = {
  type?: string | null
  archived_at?: string | null
}

function getNotificationType(row: NotificationRealtimeRow | null): Notification['type'] | null {
  return typeof row?.type === 'string' ? (row.type as Notification['type']) : null
}

function invalidatePendingApprovalQueries(
  queryClient: QueryClient,
  notificationType: Notification['type'] | null,
) {
  if (notificationType === 'reschedule_request') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.rescheduleRequests.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.rescheduleRequests.pending })
  }

  if (notificationType === 'member_edit_request') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.memberEditRequests.all })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.memberEditRequests.pending,
    })
  }

  if (notificationType === 'member_create_request') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.memberApprovalRequests.all })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.memberApprovalRequests.pending,
    })
  }

  if (notificationType === 'member_payment_request') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.memberPaymentRequests.all })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.memberPaymentRequests.pending,
    })
  }

  if (notificationType === 'member_extension_request') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.memberExtensionRequests.all })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.memberExtensionRequests.pending,
    })
  }

  if (notificationType === 'member_pause_request') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.memberPauseRequests.all })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.memberPauseRequests.pending,
    })
  }

  if (notificationType === 'status_change_request') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessionUpdateRequests.all })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.sessionUpdateRequests.pending,
    })
  }
}

function didArchiveNotification(payload: NotificationUpdatePayload) {
  return payload.old?.archived_at === null && typeof payload.new?.archived_at === 'string'
}

async function fetchNotifications(profileId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, type, title, body, read, metadata, created_at')
    .eq('recipient_id', profileId)
    .is('archived_at', null)
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

async function fetchArchivedNotifications(profileId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, type, title, body, read, metadata, created_at, archived_at')
    .eq('recipient_id', profileId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`Failed to load archived notifications: ${error.message}`)
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
    .is('archived_at', null)

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
    .is('archived_at', null)

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
    .is('archived_at', null)

  if (error) {
    throw new Error(`Failed to mark notifications as read: ${error.message}`)
  }
}

export async function archiveNotification(profileId: string, id: string, role: UserRole | null) {
  const allowedTypes = getArchivableNotificationTypes(role)
  const supabase = createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ archived_at: new Date().toISOString() })
    .eq('recipient_id', profileId)
    .eq('id', id)
    .eq('read', true)
    .in('type', allowedTypes)
    .is('archived_at', null)

  if (error) {
    throw new Error(`Failed to archive the notification: ${error.message}`)
  }
}

export async function archiveClearableNotifications(profileId: string, role: UserRole | null) {
  const allowedTypes = getArchivableNotificationTypes(role)
  const supabase = createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ archived_at: new Date().toISOString() })
    .eq('recipient_id', profileId)
    .eq('read', true)
    .in('type', allowedTypes)
    .is('archived_at', null)

  if (error) {
    throw new Error(`Failed to archive notifications: ${error.message}`)
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
          const notificationType = getNotificationType(payload.new)

          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(profileId) })
          void queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.unreadCount(profileId),
          })

          invalidatePendingApprovalQueries(queryClient, notificationType)

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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profileId}`,
        },
        (payload: NotificationUpdatePayload) => {
          if (!didArchiveNotification(payload)) {
            return
          }

          const notificationType = getNotificationType(payload.new)

          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(profileId) })
          void queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.archived(profileId),
          })
          void queryClient.invalidateQueries({
            queryKey: queryKeys.notifications.unreadCount(profileId),
          })

          invalidatePendingApprovalQueries(queryClient, notificationType)
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

export function useArchivedNotifications(profileId: string, enabled: boolean) {
  const archivedNotificationsQuery = useQuery({
    queryKey: queryKeys.notifications.archived(profileId),
    queryFn: () => fetchArchivedNotifications(profileId),
    enabled: Boolean(profileId) && enabled,
    staleTime: 0,
  })

  return {
    notifications: archivedNotificationsQuery.data ?? [],
    isLoading: archivedNotificationsQuery.isLoading,
    error: archivedNotificationsQuery.error ?? null,
    refresh: async () => {
      await archivedNotificationsQuery.refetch()
    },
  }
}
