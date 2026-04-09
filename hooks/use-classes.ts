'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchClassTrainers,
  fetchClassPaymentsReport,
  fetchClassAttendance,
  fetchClassDetail,
  fetchClassRegistrations,
  fetchClassScheduleRules,
  fetchClassSessions,
  fetchClasses,
  type ClassAttendanceRow,
  type ClassPaymentsReportStatus,
  type ClassPaymentsReportTrainer,
  type ClassRegistrationStatus,
  type ClassSessionListItem,
  type ClassTrainerProfile,
} from '@/lib/classes'
import { queryKeys } from '@/lib/query-keys'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const TWO_MINUTES_MS = 2 * 60 * 1000

export function useClasses(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const query = useQuery({
    queryKey: queryKeys.classes.all,
    queryFn: fetchClasses,
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    classes: query.data ?? [],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassDetail(id: string, options: { enabled?: boolean } = {}) {
  const enabled = Boolean(id) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.classes.detail(id),
    queryFn: () => fetchClassDetail(id),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    classItem: query.data ?? null,
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassTrainers(
  classId: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(classId) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.classes.trainers(classId),
    queryFn: () => fetchClassTrainers(classId),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    trainers: (query.data ?? []) as ClassTrainerProfile[],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassRegistrations(
  classId: string,
  status?: ClassRegistrationStatus,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(classId) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.classes.registrations(classId, status ?? ''),
    queryFn: () => fetchClassRegistrations(classId, status),
    enabled,
    staleTime: TWO_MINUTES_MS,
  })

  return {
    registrations: query.data ?? [],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassScheduleRules(
  classId: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(classId) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.classes.scheduleRules(classId),
    queryFn: () => fetchClassScheduleRules(classId),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    scheduleRules: query.data ?? [],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassSessions(
  classId: string,
  periodStart: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(classId) && Boolean(periodStart) && (options.enabled ?? true)
  const effectivePeriodStart = periodStart ?? ''
  const query = useQuery({
    queryKey: queryKeys.classes.sessions(classId, effectivePeriodStart),
    queryFn: () => fetchClassSessions(classId, effectivePeriodStart),
    enabled,
    staleTime: TWO_MINUTES_MS,
  })

  return {
    sessions: (query.data ?? []) as ClassSessionListItem[],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassAttendance(
  classId: string,
  sessionId: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(classId) && Boolean(sessionId) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.classes.attendance(sessionId),
    queryFn: () => fetchClassAttendance(classId, sessionId),
    enabled,
    staleTime: 0,
  })

  return {
    attendance: (query.data ?? []) as ClassAttendanceRow[],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassPaymentsReport(
  startDate: string,
  endDate: string,
  status: ClassPaymentsReportStatus,
  includeZero: boolean,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(startDate) && Boolean(endDate) && (options.enabled ?? false)
  const query = useQuery({
    queryKey: queryKeys.reports.classPayments(startDate, endDate, status, includeZero),
    queryFn: () => fetchClassPaymentsReport(startDate, endDate, status, includeZero),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    report: (query.data ?? null) as ClassPaymentsReportTrainer[] | null,
    isLoading: query.isFetching && !query.data,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
