import { z } from 'zod'
import { formatAccessDate, getJamaicaDateInputValue } from '@/lib/member-access-time'
import { formatJmdCurrency, JAMAICA_TIME_ZONE } from '@/lib/pt-scheduling'
import type { Class, ClassRegistration, Profile } from '@/types'

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

const classTrainerProfileSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  titles: z.array(z.string()).default([]),
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

const classesResponseSchema = z.object({
  classes: z.array(classWithTrainersSchema).default([]),
})

const classResponseSchema = z.object({
  class: classWithTrainersSchema,
})

const registrationsResponseSchema = z.object({
  registrations: z.array(classRegistrationSchema).default([]),
})

const registrationMutationResponseSchema = z.object({
  ok: z.literal(true),
  registration: classRegistrationSchema,
})

const classMutationResponseSchema = z.object({
  ok: z.literal(true),
  class: classWithTrainersSchema,
})

const errorResponseSchema = z.object({
  ok: z.literal(false).optional(),
  error: z.string().trim().min(1),
})

export type ClassTrainerProfile = Pick<Profile, 'id' | 'name' | 'titles'>
export type ClassWithTrainers = Class & {
  trainers: ClassTrainerProfile[]
}
export type ClassRegistrationStatus = ClassRegistration['status']
export type ClassRegistrantType = 'member' | 'guest'
export type ClassRegistrationListItem = ClassRegistration & {
  registrant_name: string
  registrant_type: ClassRegistrantType
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

export function formatOptionalJmd(value: number | null) {
  return typeof value === 'number' ? formatJmdCurrency(value) : 'Not set'
}

export function getDefaultClassDateValue(now = new Date()) {
  return getJamaicaDateInputValue(now)
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
