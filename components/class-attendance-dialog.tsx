'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useClassAttendance } from '@/hooks/use-classes'
import { toast } from '@/hooks/use-toast'
import {
  createClassAttendance,
  formatClassSessionDate,
  formatClassSessionTime,
  isClassRegistrationEligibleForSession,
  updateClassAttendance,
  type ClassAttendanceRow,
  type ClassRegistrationListItem,
  type ClassSessionListItem,
} from '@/lib/classes'
import { queryKeys } from '@/lib/query-keys'

type ClassAttendanceDialogProps = {
  classId: string
  session: ClassSessionListItem | null
  approvedRegistrations: ClassRegistrationListItem[]
  open: boolean
  readOnly: boolean
  profileId: string | null
  onOpenChange: (open: boolean) => void
}

type RosterRow = {
  key: string
  member_id: string | null
  guest_profile_id: string | null
  registrant_name: string
  registrant_type: 'member' | 'guest'
  attendance: ClassAttendanceRow | null
}

function getRegistrantKey(input: {
  member_id: string | null
  guest_profile_id: string | null
}) {
  if (input.member_id) {
    return `member:${input.member_id}`
  }

  if (input.guest_profile_id) {
    return `guest:${input.guest_profile_id}`
  }

  return null
}

export function ClassAttendanceDialog({
  classId,
  session,
  approvedRegistrations,
  open,
  readOnly,
  profileId,
  onOpenChange,
}: ClassAttendanceDialogProps) {
  const queryClient = useQueryClient()
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set())
  const { attendance, isLoading, error } = useClassAttendance(classId, session?.id ?? '', {
    enabled: open && Boolean(session),
  })

  const rosterRows = useMemo(() => {
    if (!session) {
      return [] as RosterRow[]
    }

    const attendanceByRegistrant = new Map<string, ClassAttendanceRow>()

    for (const attendanceRow of attendance) {
      const registrantKey = getRegistrantKey(attendanceRow)

      if (!registrantKey) {
        continue
      }

      attendanceByRegistrant.set(registrantKey, attendanceRow)
    }

    return [...approvedRegistrations]
      .filter((registration) =>
        isClassRegistrationEligibleForSession(
          registration.month_start,
          session.scheduled_at,
          session.period_start,
        ),
      )
      .sort((left, right) => left.registrant_name.localeCompare(right.registrant_name))
      .map((registration) => {
        const registrantKey = getRegistrantKey(registration)

        if (!registrantKey) {
          return null
        }

        return {
          key: registrantKey,
          member_id: registration.member_id,
          guest_profile_id: registration.guest_profile_id,
          registrant_name: registration.registrant_name,
          registrant_type: registration.registrant_type,
          attendance: attendanceByRegistrant.get(registrantKey) ?? null,
        } satisfies RosterRow
      })
      .filter((row): row is RosterRow => Boolean(row))
  }, [approvedRegistrations, attendance, session])

  const canEdit = !readOnly && Boolean(profileId)

  const updatePendingState = (registrantKey: string, isPending: boolean) => {
    setPendingKeys((current) => {
      const next = new Set(current)

      if (isPending) {
        next.add(registrantKey)
      } else {
        next.delete(registrantKey)
      }

      return next
    })
  }

  const handleToggle = async (row: RosterRow, nextChecked: boolean) => {
    if (!session || !canEdit) {
      return
    }

    updatePendingState(row.key, true)

    try {
      const nextMarkedAt = nextChecked ? new Date().toISOString() : null
      let nextAttendance: ClassAttendanceRow

      if (row.attendance) {
        nextAttendance = await updateClassAttendance(classId, session.id, row.attendance.id, {
          marked_at: nextMarkedAt,
          marked_by: nextChecked ? profileId : null,
        })
      } else {
        nextAttendance = await createClassAttendance(classId, session.id, {
          member_id: row.member_id,
          guest_profile_id: row.guest_profile_id,
          marked_at: nextMarkedAt,
          marked_by: nextChecked ? profileId : null,
        })
      }

      queryClient.setQueryData<ClassAttendanceRow[]>(
        queryKeys.classes.attendance(session.id),
        (current) => {
          const currentRows = current ?? []
          const existingIndex = currentRows.findIndex((item) => item.id === nextAttendance.id)

          if (existingIndex === -1) {
            return [...currentRows, nextAttendance]
          }

          return currentRows.map((item) => (item.id === nextAttendance.id ? nextAttendance : item))
        },
      )

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.classes.attendance(session.id),
          exact: false,
        }),
        queryClient.invalidateQueries({
          queryKey: ['classes', 'sessions', classId],
          exact: false,
        }),
      ])
    } catch (toggleError) {
      toast({
        title: 'Attendance update failed',
        description:
          toggleError instanceof Error
            ? toggleError.message
            : 'Failed to update the class attendance row.',
        variant: 'destructive',
      })
    } finally {
      updatePendingState(row.key, false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPendingKeys(new Set())
        }

        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]"
        isLoading={open && isLoading}
      >
        <DialogHeader>
          <DialogTitle>{readOnly ? 'View Attendance' : 'Mark Attendance'}</DialogTitle>
          <DialogDescription>
            {session
              ? `${formatClassSessionDate(session.scheduled_at)} at ${formatClassSessionTime(
                  session.scheduled_at,
                )}`
              : 'Review attendance for the selected class session.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load class attendance.'}
          </p>
        ) : rosterRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved registrants for this session.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registrant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rosterRows.map((row) => {
                const isPending = pendingKeys.has(row.key)

                return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.registrant_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {row.registrant_type === 'member' ? 'Member' : 'Guest'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Checkbox
                          checked={Boolean(row.attendance?.marked_at)}
                          disabled={!canEdit || isPending}
                          aria-label={`Mark attendance for ${row.registrant_name}`}
                          onCheckedChange={(checked) => {
                            void handleToggle(row, checked === true)
                          }}
                        />
                        {isPending ? <Spinner className="size-4" /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}
