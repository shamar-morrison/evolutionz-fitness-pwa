import { z } from 'zod'
import {
  formatAccessDate,
  getJamaicaDateInputValue,
  normalizeTimeInputValue,
} from '@/lib/member-access-time'
import {
  buildJamaicaScheduledAt,
  formatJmdCurrency,
  formatSessionTime,
  getJamaicaDateValue,
  JAMAICA_TIME_ZONE,
} from '@/lib/pt-scheduling'
import type {
  Class,
  ClassAttendanceListItem,
  ClassRegistration,
  ClassScheduleRule,
  ClassScheduleRuleDay,
  ClassSessionSummary,
  ClassTrainer,
  Profile,
} from '@/types'

const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u
const MS_PER_DAY = 24 * 60 * 60 * 1000

const numericValueSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string') {
      const trimmedValue = value.trim()

      if (!trimmedValue) {
        return Number.NaN
      }

      return Number(trimmedValue)
    }

    return value
  },
  z.number().finite(),
)

const optionalNumericValueSchema = numericValueSchema.nullable()
const optionalDateValueSchema = z
  .string()
  .trim()
  .regex(DATE_VALUE_PATTERN)
  .nullable()
const countValueSchema = z.number().int().nonnegative()
const classScheduleRuleDaySchema = z.number().int().min(0).max(6)

const classTrainerProfileSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  titles: z.array(z.string()).default([]),
})

const classTrainerSchema = z.object({
  class_id: z.string().trim().min(1),
  profile_id: z.string().trim().min(1),
  created_at: z.string().trim().min(1),
})

const classSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  schedule_description: z.string().trim().min(1),
  per_session_fee: optionalNumericValueSchema,
  monthly_fee: optionalNumericValueSchema,
  trainer_compensation_pct: numericValueSchema,
  current_period_start: optionalDateValueSchema,
  created_at: z.string().trim().min(1),
})

const classWithTrainersSchema = classSchema.extend({
  trainers: z.array(classTrainerProfileSchema).default([]),
})

const classRegistrationSchema = z.object({
  id: z.string().trim().min(1),
  class_id: z.string().trim().min(1),
  member_id: z.string().trim().min(1).nullable(),
  guest_profile_id: z.string().trim().min(1).nullable(),
  month_start: z.string().trim().regex(DATE_VALUE_PATTERN),
  status: z.enum(['pending', 'approved', 'denied']),
  amount_paid: numericValueSchema,
  payment_recorded_at: z.string().trim().min(1).nullable(),
  reviewed_by: z.string().trim().min(1).nullable(),
  reviewed_at: z.string().trim().min(1).nullable(),
  review_note: z.string().trim().min(1).nullable(),
  created_at: z.string().trim().min(1),
  registrant_name: z.string().trim().min(1),
  registrant_type: z.enum(['member', 'guest']),
})

const classScheduleRuleSchema = z.object({
  id: z.string().trim().min(1),
  class_id: z.string().trim().min(1),
  day_of_week: classScheduleRuleDaySchema,
  session_time: z.string().trim().min(1),
  created_at: z.string().trim().min(1),
})

const classSessionSummarySchema = z.object({
  id: z.string().trim().min(1),
  class_id: z.string().trim().min(1),
  scheduled_at: z.string().trim().min(1),
  period_start: z.string().trim().regex(DATE_VALUE_PATTERN),
  created_at: z.string().trim().min(1),
  marked_count: countValueSchema,
  total_count: countValueSchema,
})

const classAttendanceListItemSchema = z.object({
  id: z.string().trim().min(1),
  session_id: z.string().trim().min(1),
  member_id: z.string().trim().min(1).nullable(),
  guest_profile_id: z.string().trim().min(1).nullable(),
  marked_by: z.string().trim().min(1).nullable(),
  marked_at: z.string().trim().min(1).nullable(),
  created_at: z.string().trim().min(1),
  registrant_name: z.string().trim().min(1),
  registrant_type: z.enum(['member', 'guest']),
})

const classesResponseSchema = z.object({
  classes: z.array(classWithTrainersSchema).default([]),
})

const classResponseSchema = z.object({
  class: classWithTrainersSchema,
})

const classTrainersResponseSchema = z.object({
  trainers: z.array(classTrainerProfileSchema).default([]),
})

const registrationsResponseSchema = z.object({
  registrations: z.array(classRegistrationSchema).default([]),
})

const scheduleRulesResponseSchema = z.object({
  schedule_rules: z.array(classScheduleRuleSchema).default([]),
})

const sessionsResponseSchema = z.object({
  sessions: z.array(classSessionSummarySchema).default([]),
})

const attendanceResponseSchema = z.object({
  attendance: z.array(classAttendanceListItemSchema).default([]),
})

const registrationMutationResponseSchema = z.object({
  ok: z.literal(true),
  registration: classRegistrationSchema,
})

const classMutationResponseSchema = z.object({
  ok: z.literal(true),
  class: classWithTrainersSchema,
})

const scheduleRuleMutationResponseSchema = z.object({
  ok: z.literal(true),
  schedule_rule: classScheduleRuleSchema,
})

const classTrainerMutationResponseSchema = z.object({
  ok: z.literal(true),
  class_trainer: classTrainerSchema,
})

const attendanceMutationResponseSchema = z.object({
  ok: z.literal(true),
  attendance: classAttendanceListItemSchema,
})

const generateSessionsResponseSchema = z.object({
  ok: z.literal(true),
  count: countValueSchema,
})

const classPaymentsReportResponseSchema = z.array(
  z.object({
    trainerId: z.string().trim().min(1),
    trainerName: z.string().trim().min(1),
    trainerTitles: z.array(z.string()).default([]),
    classes: z
      .array(
        z.object({
          classId: z.string().trim().min(1),
          className: z.string().trim().min(1),
          registrationCount: countValueSchema,
          totalCollected: countValueSchema,
          compensationPct: z.number().finite(),
          trainerCount: z.number().int().positive(),
          payout: z.number().int(),
        }),
      )
      .default([]),
    totalPayout: countValueSchema,
  }),
)

const errorResponseSchema = z.object({
  ok: z.literal(false).optional(),
  error: z.string().trim().min(1),
})

export const CLASS_DAY_OF_WEEK_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export type {
  ClassAttendanceListItem,
  ClassScheduleRule,
  ClassScheduleRuleDay,
  ClassSessionSummary,
} from '@/types'

export type ClassTrainerProfile = Pick<Profile, 'id' | 'name' | 'titles'>
export type ClassWithTrainers = Class & {
  trainers: ClassTrainerProfile[]
}
export type ClassTrainerAssignment = ClassTrainer
export type ClassRegistrationStatus = ClassRegistration['status']
export type ClassRegistrantType = 'member' | 'guest'
export type ClassRegistrationListItem = ClassRegistration & {
  registrant_name: string
  registrant_type: ClassRegistrantType
}
export type ClassSessionListItem = ClassSessionSummary
export type ClassAttendanceRow = ClassAttendanceListItem
export type ClassSessionPreviewItem = {
  date_value: string
  day_of_week: ClassScheduleRuleDay
  session_time: string
  scheduled_at: string
}
export const CLASS_PAYMENTS_REPORT_STATUSES = ['approved', 'include-pending'] as const
export type ClassPaymentsReportStatus = typeof CLASS_PAYMENTS_REPORT_STATUSES[number]
export type ClassPaymentsReportClass = {
  classId: string
  className: string
  registrationCount: number
  totalCollected: number
  compensationPct: number
  trainerCount: number
  payout: number
}
export type ClassPaymentsReportTrainer = {
  trainerId: string
  trainerName: string
  trainerTitles: string[]
  classes: ClassPaymentsReportClass[]
  totalPayout: number
}
export type CreateClassRegistrationInput =
  | {
      registrant_type: 'member'
      member_id: string
      month_start: string
      amount_paid: number
      payment_received: boolean
    }
  | {
      registrant_type: 'guest'
      guest: {
        name: string
        phone?: string | null
        email?: string | null
        remark?: string | null
      }
      month_start: string
      amount_paid: number
      payment_received: boolean
    }

export type ReviewClassRegistrationInput =
  | {
      status: 'approved'
      amount_paid: number
      review_note?: string | null
    }
  | {
      status: 'denied'
      review_note: string
    }

export type CreateClassScheduleRuleInput = {
  day_of_week: ClassScheduleRuleDay
  session_time: string
}

export type GenerateClassSessionsInput = {
  sessions: Array<{
    scheduled_at: string
  }>
}

export type AssignClassTrainerInput = {
  profile_id: string
}

export type CreateClassAttendanceInput = {
  member_id?: string | null
  guest_profile_id?: string | null
  marked_by: string | null
  marked_at: string | null
}

export type UpdateClassAttendanceInput = {
  marked_at: string | null
  marked_by: string | null
}

export type UpdateClassSettingsInput = {
  monthly_fee: number
  per_session_fee: number | null
  trainer_compensation_percent: number
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildSearchParams(filters: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      searchParams.set(key, value)
    }
  }

  return searchParams
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  const parsed = errorResponseSchema.safeParse(payload)

  return parsed.success ? parsed.data.error : fallback
}

function normalizeClassTimeValue(value: string) {
  return normalizeTimeInputValue(value)
}

export function getUtcDateFromDateValue(value: string) {
  const match = DATE_VALUE_PATTERN.exec(value.trim())

  if (!match) {
    return null
  }

  const [, yearPart, monthPart, dayPart] = match
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1
  const day = Number(dayPart)
  const date = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function formatUtcDateValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

export function addDaysToDateValue(value: string, days: number) {
  const date = getUtcDateFromDateValue(value)

  if (!date) {
    return null
  }

  date.setUTCDate(date.getUTCDate() + days)

  return formatUtcDateValue(date)
}

export function getDaysBetweenDateValues(startValue: string, endValue: string) {
  const startDate = getUtcDateFromDateValue(startValue)
  const endDate = getUtcDateFromDateValue(endValue)

  if (!startDate || !endDate) {
    return null
  }

  return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY)
}

export function getClassDayOfWeekLabel(value: number) {
  return CLASS_DAY_OF_WEEK_LABELS[value as ClassScheduleRuleDay] ?? 'Unknown day'
}

export function getClassDayOfWeekFromDateValue(value: string) {
  const date = getUtcDateFromDateValue(value)

  if (!date) {
    return null
  }

  return date.getUTCDay() as ClassScheduleRuleDay
}

export function isPerSessionClass(classItem: Pick<Class, 'name'>) {
  return normalizeText(classItem.name).toLowerCase() === 'bootcamp'
}

export function isDanceCardioClass(classItem: Pick<Class, 'name'>) {
  return normalizeText(classItem.name).toLowerCase() === 'dance cardio'
}

export function isFreeMemberRegistration(
  classItem: Pick<Class, 'name'>,
  registrantType: ClassRegistrantType,
) {
  return registrantType === 'member' && isDanceCardioClass(classItem)
}

export function getClassPeriodEndDateValue(currentPeriodStart: string | null) {
  if (!currentPeriodStart) {
    return null
  }

  return addDaysToDateValue(currentPeriodStart, 27)
}

export function calculateClassRegistrationAmount({
  classItem,
  month_start,
  registrant_type,
}: {
  classItem: Pick<Class, 'name' | 'monthly_fee' | 'per_session_fee' | 'current_period_start'>
  month_start: string
  registrant_type: ClassRegistrantType
}) {
  if (isFreeMemberRegistration(classItem, registrant_type)) {
    return 0
  }

  if (isPerSessionClass(classItem)) {
    return classItem.per_session_fee ?? 0
  }

  if (typeof classItem.monthly_fee !== 'number') {
    return classItem.per_session_fee ?? 0
  }

  if (!classItem.current_period_start) {
    return classItem.monthly_fee
  }

  const daysOffset = getDaysBetweenDateValues(classItem.current_period_start, month_start)
  const currentPeriodEnd = getClassPeriodEndDateValue(classItem.current_period_start)

  if (
    daysOffset === null ||
    daysOffset <= 0 ||
    !currentPeriodEnd ||
    getDaysBetweenDateValues(currentPeriodEnd, month_start) === null
  ) {
    return classItem.monthly_fee
  }

  if (daysOffset >= 28) {
    return classItem.monthly_fee
  }

  const daysRemaining = 28 - daysOffset

  if (daysRemaining <= 0) {
    return classItem.monthly_fee
  }

  return Math.round((classItem.monthly_fee / 28) * daysRemaining)
}

export function formatClassDate(value: string | null) {
  return formatAccessDate(value)
}

export function formatClassDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatClassTime(value: string) {
  return formatSessionTime(value)
}

export function formatClassSessionDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function formatClassSessionTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function buildClassScheduledAt(dateValue: string, timeValue: string) {
  return buildJamaicaScheduledAt(dateValue, timeValue)
}

export function getClassPeriodDateValues(currentPeriodStart: string) {
  const values: string[] = []

  for (let index = 0; index < 28; index += 1) {
    const nextDateValue = addDaysToDateValue(currentPeriodStart, index)

    if (!nextDateValue) {
      continue
    }

    values.push(nextDateValue)
  }

  return values
}

export function sortClassScheduleRules(rules: ClassScheduleRule[]) {
  return [...rules].sort((left, right) => {
    if (left.day_of_week !== right.day_of_week) {
      return left.day_of_week - right.day_of_week
    }

    const leftTime = normalizeClassTimeValue(left.session_time) ?? left.session_time
    const rightTime = normalizeClassTimeValue(right.session_time) ?? right.session_time

    return leftTime.localeCompare(rightTime)
  })
}

export function getClassSessionPreviewItems(
  currentPeriodStart: string,
  rules: ClassScheduleRule[],
) {
  const previewItems: ClassSessionPreviewItem[] = []
  const sortedRules = sortClassScheduleRules(rules)

  for (const dateValue of getClassPeriodDateValues(currentPeriodStart)) {
    const dayOfWeek = getClassDayOfWeekFromDateValue(dateValue)

    if (dayOfWeek === null) {
      continue
    }

    for (const rule of sortedRules) {
      if (rule.day_of_week !== dayOfWeek) {
        continue
      }

      const scheduledAt = buildClassScheduledAt(dateValue, rule.session_time)

      if (!scheduledAt) {
        continue
      }

      previewItems.push({
        date_value: dateValue,
        day_of_week: dayOfWeek,
        session_time: normalizeClassTimeValue(rule.session_time) ?? rule.session_time,
        scheduled_at: scheduledAt,
      })
    }
  }

  return previewItems.sort((left, right) => left.scheduled_at.localeCompare(right.scheduled_at))
}

export function isClassRegistrationEligibleForSession(
  registrationStartDateValue: string,
  sessionScheduledAt: string,
  periodStartDateValue?: string,
) {
  const sessionDateValue = getJamaicaDateValue(sessionScheduledAt)

  if (!sessionDateValue) {
    return false
  }

  if (periodStartDateValue) {
    const periodOffset = getDaysBetweenDateValues(periodStartDateValue, registrationStartDateValue)

    if (periodOffset === null || periodOffset < 0) {
      return false
    }
  }

  const dayOffset = getDaysBetweenDateValues(registrationStartDateValue, sessionDateValue)

  return dayOffset !== null && dayOffset >= 0
}

export function formatOptionalJmd(value: number | null) {
  return typeof value === 'number'
    ? `JMD ${formatJmdCurrency(value).replace(/^JMD\s*/u, '')}`
    : 'Not set'
}

export function getDefaultClassDateValue(now = new Date()) {
  return getJamaicaDateInputValue(now)
}

export function getCurrent28DayDateRangeInJamaica(now = new Date()) {
  const endDate = getJamaicaDateInputValue(now)
  const startDate = addDaysToDateValue(endDate, -27)

  if (!startDate) {
    throw new Error('Failed to resolve the current 28-day Jamaica date range.')
  }

  return {
    startDate,
    endDate,
  }
}

export async function fetchClasses() {
  const response = await fetch('/api/classes', {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load classes.'))
  }

  const parsed = classesResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load classes.')
  }

  return parsed.data.classes as ClassWithTrainers[]
}

export async function fetchClassDetail(id: string) {
  const response = await fetch(`/api/classes/${encodeURIComponent(id)}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the class.'))
  }

  const parsed = classResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the class.')
  }

  return parsed.data.class as ClassWithTrainers
}

export async function fetchClassTrainers(classId: string) {
  const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/trainers`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load class trainers.'))
  }

  const parsed = classTrainersResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load class trainers.')
  }

  return parsed.data.trainers as ClassTrainerProfile[]
}

export async function fetchClassRegistrations(
  classId: string,
  status?: ClassRegistrationStatus,
) {
  const searchParams = buildSearchParams({
    status,
  })
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/registrations${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load class registrations.'))
  }

  const parsed = registrationsResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load class registrations.')
  }

  return parsed.data.registrations as ClassRegistrationListItem[]
}

export async function fetchClassScheduleRules(classId: string) {
  const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/schedule-rules`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load class schedule rules.'))
  }

  const parsed = scheduleRulesResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load class schedule rules.')
  }

  return parsed.data.schedule_rules as ClassScheduleRule[]
}

export async function createClassScheduleRule(
  classId: string,
  input: CreateClassScheduleRuleInput,
) {
  const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/schedule-rules`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to create the class schedule rule.'))
  }

  const parsed = scheduleRuleMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to create the class schedule rule.')
  }

  return parsed.data.schedule_rule as ClassScheduleRule
}

export async function assignClassTrainer(
  classId: string,
  input: AssignClassTrainerInput,
) {
  const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/trainers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to assign the trainer to this class.'))
  }

  const parsed = classTrainerMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to assign the trainer to this class.')
  }

  return parsed.data.class_trainer as ClassTrainerAssignment
}

export async function removeClassTrainer(classId: string, profileId: string) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/trainers/${encodeURIComponent(profileId)}`,
    {
      method: 'DELETE',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to remove the trainer from this class.'))
  }
}

export async function deleteClassScheduleRule(classId: string, ruleId: string) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/schedule-rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'DELETE',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to delete the class schedule rule.'))
  }
}

export async function fetchClassSessions(classId: string, periodStart: string) {
  const searchParams = buildSearchParams({
    period_start: periodStart,
  })
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/sessions?${searchParams.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load class sessions.'))
  }

  const parsed = sessionsResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load class sessions.')
  }

  return parsed.data.sessions as ClassSessionListItem[]
}

export async function generateClassSessions(
  classId: string,
  input: GenerateClassSessionsInput,
) {
  const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to generate class sessions.'))
  }

  const parsed = generateSessionsResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to generate class sessions.')
  }

  return parsed.data.count
}

export async function fetchClassAttendance(classId: string, sessionId: string) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(sessionId)}/attendance`,
    {
      method: 'GET',
      cache: 'no-store',
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load class attendance.'))
  }

  const parsed = attendanceResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load class attendance.')
  }

  return parsed.data.attendance as ClassAttendanceRow[]
}

export async function createClassAttendance(
  classId: string,
  sessionId: string,
  input: CreateClassAttendanceInput,
) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(sessionId)}/attendance`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to update class attendance.'))
  }

  const parsed = attendanceMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to update class attendance.')
  }

  return parsed.data.attendance as ClassAttendanceRow
}

export async function updateClassAttendance(
  classId: string,
  sessionId: string,
  attendanceId: string,
  input: UpdateClassAttendanceInput,
) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(
      sessionId,
    )}/attendance/${encodeURIComponent(attendanceId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to update class attendance.'))
  }

  const parsed = attendanceMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to update class attendance.')
  }

  return parsed.data.attendance as ClassAttendanceRow
}

export async function createClassRegistration(
  classId: string,
  input: CreateClassRegistrationInput,
) {
  const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/registrations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to create the class registration.'))
  }

  const parsed = registrationMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to create the class registration.')
  }

  return parsed.data.registration as ClassRegistrationListItem
}

export async function updateClassPeriodStart(id: string, current_period_start: string) {
  const response = await fetch(`/api/classes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      current_period_start,
    }),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to update the class billing period.'))
  }

  const parsed = classMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to update the class billing period.')
  }

  return parsed.data.class as ClassWithTrainers
}

export async function updateClassSettings(id: string, input: UpdateClassSettingsInput) {
  const response = await fetch(`/api/classes/${encodeURIComponent(id)}/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to update class settings.'))
  }

  const parsed = classMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to update class settings.')
  }

  return parsed.data.class as ClassWithTrainers
}

export async function reviewClassRegistration(
  classId: string,
  registrationId: string,
  input: ReviewClassRegistrationInput,
) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/registrations/${encodeURIComponent(registrationId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to review the class registration.'))
  }

  const parsed = registrationMutationResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to review the class registration.')
  }

  return parsed.data.registration as ClassRegistrationListItem
}

export async function fetchClassPaymentsReport(
  startDate: string,
  endDate: string,
  status: ClassPaymentsReportStatus,
  includeZero: boolean,
) {
  const searchParams = buildSearchParams({
    start: startDate,
    end: endDate,
    status,
    includeZero: String(includeZero),
  })
  const response = await fetch(`/api/reports/class-payments?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, 'Failed to load the class payments report.'))
  }

  const parsed = classPaymentsReportResponseSchema.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Failed to load the class payments report.')
  }

  return parsed.data as ClassPaymentsReportTrainer[]
}
