import type { ClassRegistrationListItem } from '@/lib/classes'
import { isClassRegistrationEligibleForSession } from '@/lib/classes'

type ClassesAttendanceClient = {
  from(table: string): any
}

function getRegistrantAttendanceFilter(
  query: any,
  registration: Pick<ClassRegistrationListItem, 'member_id' | 'guest_profile_id'>,
) {
  if (registration.member_id) {
    return query.eq('member_id', registration.member_id).is('guest_profile_id', null)
  }

  if (registration.guest_profile_id) {
    return query.eq('guest_profile_id', registration.guest_profile_id).is('member_id', null)
  }

  return query
}

export async function reconcileRegistrationAttendance({
  supabase,
  classId,
  registration,
  includeFutureOnly = true,
}: {
  supabase: ClassesAttendanceClient
  classId: string
  registration: Pick<ClassRegistrationListItem, 'id' | 'member_id' | 'guest_profile_id'>
  includeFutureOnly?: boolean
}) {
  const nowIso = new Date().toISOString()
  let sessionsQuery = supabase
    .from('class_sessions')
    .select('id, scheduled_at, period_start')
    .eq('class_id', classId)

  if (includeFutureOnly) {
    sessionsQuery = sessionsQuery.gt('scheduled_at', nowIso)
  }

  sessionsQuery = sessionsQuery.order('scheduled_at', { ascending: true })

  const { data: sessions, error: sessionsError } = await sessionsQuery

  if (sessionsError) {
    throw new Error(`Failed to read class sessions for attendance reconciliation: ${sessionsError.message}`)
  }

  const sessionRows = (sessions ?? []) as Array<{
    id: string
    scheduled_at: string
    period_start: string
  }>

  if (sessionRows.length === 0) {
    return
  }

  const sessionIds = sessionRows.map((session) => String(session.id))
  let approvedRegistrationsQuery = supabase
    .from('class_registrations')
    .select('id, month_start')
    .eq('class_id', classId)
    .eq('status', 'approved')

  approvedRegistrationsQuery = getRegistrantAttendanceFilter(approvedRegistrationsQuery, registration)

  const { data: approvedRegistrations, error: approvedRegistrationsError } =
    await approvedRegistrationsQuery

  if (approvedRegistrationsError) {
    throw new Error(
      `Failed to read approved class registrations for attendance reconciliation: ${approvedRegistrationsError.message}`,
    )
  }

  let existingAttendanceQuery = supabase
    .from('class_attendance')
    .select('id, session_id')
    .in('session_id', sessionIds)

  existingAttendanceQuery = getRegistrantAttendanceFilter(existingAttendanceQuery, registration)

  const { data: existingAttendance, error: attendanceError } = await existingAttendanceQuery

  if (attendanceError) {
    throw new Error(
      `Failed to read class attendance rows for reconciliation: ${attendanceError.message}`,
    )
  }

  const attendanceBySessionId = new Map(
    ((existingAttendance ?? []) as Array<{ id: string; session_id: string }>).map((row) => [
      String(row.session_id),
      String(row.id),
    ]),
  )

  const approvedRegistrationRows = (approvedRegistrations ?? []) as Array<{
    id: string
    month_start: string
  }>
  const sessionIdsToKeep = new Set(
    sessionRows
      .filter((session) =>
        approvedRegistrationRows.some((approvedRegistration) =>
          isClassRegistrationEligibleForSession(
            String(approvedRegistration.month_start),
            String(session.scheduled_at),
            String(session.period_start),
          ),
        ),
      )
      .map((session) => String(session.id)),
  )

  const rowsToInsert = sessionRows
    .filter((session) => sessionIdsToKeep.has(String(session.id)))
    .filter((session) => !attendanceBySessionId.has(String(session.id)))
    .map((session) => ({
      session_id: String(session.id),
      member_id: registration.member_id,
      guest_profile_id: registration.guest_profile_id,
      marked_at: null,
      marked_by: null,
    }))

  const attendanceIdsToDelete = Array.from(attendanceBySessionId.entries())
    .filter(([sessionId]) => !sessionIdsToKeep.has(sessionId))
    .map(([, attendanceId]) => attendanceId)

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('class_attendance').insert(rowsToInsert)

    if (insertError) {
      throw new Error(`Failed to create class attendance rows: ${insertError.message}`)
    }
  }

  if (attendanceIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('class_attendance')
      .delete()
      .in('id', attendanceIdsToDelete)

    if (deleteError) {
      throw new Error(`Failed to remove class attendance rows: ${deleteError.message}`)
    }
  }
}

export async function clearFutureRegistrationAttendance({
  supabase,
  classId,
  registration,
}: {
  supabase: ClassesAttendanceClient
  classId: string
  registration: Pick<ClassRegistrationListItem, 'id' | 'member_id' | 'guest_profile_id'>
}) {
  const nowIso = new Date().toISOString()
  const { data: sessions, error: sessionsError } = await supabase
    .from('class_sessions')
    .select('id, scheduled_at, period_start')
    .eq('class_id', classId)
    .gt('scheduled_at', nowIso)

  if (sessionsError) {
    throw new Error(`Failed to read future class sessions for attendance cleanup: ${sessionsError.message}`)
  }

  const sessionRows = (sessions ?? []) as Array<{
    id: string
    scheduled_at: string
    period_start: string
  }>
  const sessionIds = sessionRows.map((session) => String(session.id))

  if (sessionIds.length === 0) {
    return
  }

  let approvedRegistrationsQuery = supabase
    .from('class_registrations')
    .select('id, month_start')
    .eq('class_id', classId)
    .eq('status', 'approved')
    .neq('id', registration.id)

  approvedRegistrationsQuery = getRegistrantAttendanceFilter(approvedRegistrationsQuery, registration)

  const { data: approvedRegistrations, error: approvedRegistrationsError } =
    await approvedRegistrationsQuery

  if (approvedRegistrationsError) {
    throw new Error(
      `Failed to read remaining class registrations for attendance cleanup: ${approvedRegistrationsError.message}`,
    )
  }

  const approvedRegistrationRows = (approvedRegistrations ?? []) as Array<{
    id: string
    month_start: string
  }>
  const sessionIdsToKeep = new Set(
    sessionRows
      .filter((session) =>
        approvedRegistrationRows.some((approvedRegistration) =>
          isClassRegistrationEligibleForSession(
            String(approvedRegistration.month_start),
            String(session.scheduled_at),
            String(session.period_start),
          ),
        ),
      )
      .map((session) => String(session.id)),
  )

  let existingAttendanceQuery = supabase
    .from('class_attendance')
    .select('id, session_id')
    .in('session_id', sessionIds)

  existingAttendanceQuery = getRegistrantAttendanceFilter(existingAttendanceQuery, registration)

  const { data: existingAttendance, error: existingAttendanceError } =
    await existingAttendanceQuery

  if (existingAttendanceError) {
    throw new Error(
      `Failed to read existing attendance rows for cleanup: ${existingAttendanceError.message}`,
    )
  }

  const attendanceIdsToDelete = ((existingAttendance ?? []) as Array<{ id: string; session_id: string }>)
    .filter((attendance) => !sessionIdsToKeep.has(String(attendance.session_id)))
    .map((attendance) => String(attendance.id))

  if (attendanceIdsToDelete.length === 0) {
    return
  }

  const { error: deleteError } = await supabase
    .from('class_attendance')
    .delete()
    .in('id', attendanceIdsToDelete)

  if (deleteError) {
    throw new Error(`Failed to clear future class attendance rows: ${deleteError.message}`)
  }
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
  registration: Pick<ClassRegistrationListItem, 'id' | 'member_id' | 'guest_profile_id'>
}) {
  await reconcileRegistrationAttendance({
    supabase,
    classId,
    registration,
  })
}
