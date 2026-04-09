import type { ClassRegistrationListItem } from '@/lib/classes'
import { isClassRegistrationEligibleForSession } from '@/lib/classes'

type ClassesAttendanceClient = {
  from(table: string): any
}

export async function backfillRegistrationAttendanceForCurrentPeriod({
  supabase,
  classId,
  currentPeriodStart,
  registration,
}: {
  supabase: ClassesAttendanceClient
  classId: string
  currentPeriodStart: string
  registration: Pick<ClassRegistrationListItem, 'member_id' | 'guest_profile_id' | 'month_start'>
}) {
  const nowIso = new Date().toISOString()
  const { data: sessions, error: sessionsError } = await supabase
    .from('class_sessions')
    .select('id, scheduled_at, period_start')
    .eq('class_id', classId)
    .eq('period_start', currentPeriodStart)
    .gt('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })

  if (sessionsError) {
    throw new Error(`Failed to read current-period sessions for attendance backfill: ${sessionsError.message}`)
  }

  const attendanceRows = ((sessions ?? []) as Array<{
    id: string
    scheduled_at: string
    period_start: string
  }>)
    .filter((session) =>
      isClassRegistrationEligibleForSession(
        registration.month_start,
        String(session.scheduled_at),
        String(session.period_start ?? currentPeriodStart),
      ),
    )
    .map((session) => ({
      session_id: String(session.id),
      member_id: registration.member_id,
      guest_profile_id: registration.guest_profile_id,
      marked_at: null,
      marked_by: null,
    }))

  if (attendanceRows.length === 0) {
    return
  }

  const { error: attendanceError } = await supabase.from('class_attendance').insert(attendanceRows)

  if (attendanceError) {
    throw new Error(`Failed to create class attendance rows: ${attendanceError.message}`)
  }
}
