'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatClassDate,
  formatClassDateTime,
  formatClassSessionDate,
  formatClassSessionTime,
  formatOptionalJmd,
  type ClassRegistrationListItem,
  type ClassSessionListItem,
} from '@/lib/classes'

type InfoFieldProps = {
  label: string
  value: string
}

type EmptyCardStateProps = {
  label: string
}

type RegistrationsTableProps = {
  registrations: ClassRegistrationListItem[]
  showStatus?: boolean
  showActions?: boolean
  onApprove?: (registration: ClassRegistrationListItem) => void
  onDeny?: (registration: ClassRegistrationListItem) => void
  onEdit?: (registration: ClassRegistrationListItem) => void
  onRemove?: (registration: ClassRegistrationListItem) => void
}

type SessionsTableProps = {
  sessions: ClassSessionListItem[]
  actionLabel: string
  onOpenAttendance: (session: ClassSessionListItem) => void
}

export function InfoField({ label, value }: InfoFieldProps) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

export function EmptyCardState({ label }: EmptyCardStateProps) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {label}
      </CardContent>
    </Card>
  )
}

export function RegistrationsTable({
  registrations,
  showStatus = false,
  showActions = false,
  onApprove,
  onDeny,
  onEdit,
  onRemove,
}: RegistrationsTableProps) {
  if (registrations.length === 0) {
    return (
      <EmptyCardState
        label={showActions ? 'No pending approvals.' : 'No approved registrations yet.'}
      />
    )
  }

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <CardContent className="p-0">
        <Table size="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount Paid</TableHead>
              <TableHead>Period Start</TableHead>
              <TableHead>Registered At</TableHead>
              {showStatus ? <TableHead>Status</TableHead> : null}
              {showActions ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {registrations.map((registration) => (
              <TableRow key={registration.id}>
                <TableCell className="font-medium">{registration.registrant_name}</TableCell>
                <TableCell>
                  {registration.registrant_type === 'member' ? 'Member' : 'Guest'}
                </TableCell>
                <TableCell>{formatOptionalJmd(registration.amount_paid)}</TableCell>
                <TableCell>{formatClassDate(registration.month_start)}</TableCell>
                <TableCell>{formatClassDateTime(registration.created_at)}</TableCell>
                {showStatus ? (
                  <TableCell className="capitalize">{registration.status}</TableCell>
                ) : null}
                {showActions ? (
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {onDeny && onApprove ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onDeny?.(registration)}
                          >
                            Deny
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onApprove?.(registration)}
                          >
                            Approve
                          </Button>
                        </>
                      ) : null}
                      {onEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(registration)}
                        >
                          Edit
                        </Button>
                      ) : null}
                      {onRemove ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => onRemove(registration)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function SessionsTable({
  sessions,
  actionLabel,
  onOpenAttendance,
}: SessionsTableProps) {
  if (sessions.length === 0) {
    return <EmptyCardState label="No sessions generated for this period." />
  }

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <CardContent className="p-0">
        <Table size="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Attendance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">
                  {formatClassSessionDate(session.scheduled_at)}
                </TableCell>
                <TableCell>{formatClassSessionTime(session.scheduled_at)}</TableCell>
                <TableCell>
                  {session.marked_count} / {session.total_count}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenAttendance(session)}
                    >
                      {actionLabel}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
