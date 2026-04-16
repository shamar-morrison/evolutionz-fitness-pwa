import { JAMAICA_OFFSET, JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'

export const MEMBER_EVENTS_PAGE_SIZE = 10

export type MemberEventStatus =
  | 'success'
  | 'denied_invalid_card'
  | 'denied_expired'
  | 'denied_not_in_whitelist'
  | 'denied'

export type MemberEvent = {
  time: string
  status: MemberEventStatus
  major: number
  minor: number
  cardNo: string | null
}

export type MemberEventsResponse = {
  events: MemberEvent[]
  totalMatches: number
}

type MemberEventsErrorResponse = {
  error: string
  jobId?: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizeInteger(value: unknown, fallback = 0) {
  const numericValue = Number(value)

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    return fallback
  }

  return numericValue
}

function getFormatterParts(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  locale = 'en-JM',
) {
  const formatter = new Intl.DateTimeFormat(locale, options)
  const values = new Map<string, string>()

  for (const part of formatter.formatToParts(date)) {
    if (part.type === 'literal') {
      continue
    }

    values.set(part.type, part.value)
  }

  return values
}

function parseHikEventLocalDateTime(value: string) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  const match = normalizedValue.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/u,
  )

  if (!match) {
    return null
  }

  return match[1]
}

export function mapMinorCodeToMemberEventStatus(minor: number): MemberEventStatus {
  switch (minor) {
    case 1:
      return 'success'
    case 2:
      return 'denied_invalid_card'
    case 3:
      return 'denied_expired'
    case 8:
      return 'denied'
    case 75:
      return 'denied_not_in_whitelist'
    default:
      return 'denied'
  }
}

export function convertHikEventTimeToJamaicaIso(value: string) {
  const localDateTime = parseHikEventLocalDateTime(value)

  if (!localDateTime) {
    return null
  }

  return `${localDateTime}${JAMAICA_OFFSET}`
}

export function normalizeBridgeMemberEvents(input: unknown): MemberEventsResponse {
  const payload = typeof input === 'object' && input !== null ? input : {}
  const rawEvents = Array.isArray((payload as { events?: unknown }).events)
    ? ((payload as { events: unknown[] }).events ?? [])
    : []
  const events: MemberEvent[] = []

  for (const rawEvent of rawEvents) {
    if (typeof rawEvent !== 'object' || rawEvent === null) {
      continue
    }

    const time = convertHikEventTimeToJamaicaIso((rawEvent as { time?: unknown }).time as string)

    if (!time) {
      continue
    }

    const major = normalizeInteger((rawEvent as { major?: unknown }).major)
    const minor = normalizeInteger((rawEvent as { minor?: unknown }).minor)

    events.push({
      time,
      status: mapMinorCodeToMemberEventStatus(minor),
      major,
      minor,
      cardNo: normalizeNullableText((rawEvent as { cardNo?: unknown }).cardNo),
    })
  }

  const totalMatches = normalizeInteger(
    (payload as { totalMatches?: unknown }).totalMatches,
    events.length,
  )

  return {
    events,
    totalMatches: Math.max(totalMatches, events.length),
  }
}

export function normalizeMemberEventsResponse(input: unknown): MemberEventsResponse {
  const payload = typeof input === 'object' && input !== null ? input : {}
  const rawEvents = Array.isArray((payload as { events?: unknown }).events)
    ? ((payload as { events: unknown[] }).events ?? [])
    : []
  const events: MemberEvent[] = []

  for (const rawEvent of rawEvents) {
    if (typeof rawEvent !== 'object' || rawEvent === null) {
      continue
    }

    const time = normalizeText((rawEvent as { time?: unknown }).time)
    const status = (rawEvent as { status?: unknown }).status

    if (
      !time ||
      (status !== 'success' &&
        status !== 'denied_invalid_card' &&
        status !== 'denied_expired' &&
        status !== 'denied_not_in_whitelist' &&
        status !== 'denied')
    ) {
      continue
    }

    events.push({
      time,
      status,
      major: normalizeInteger((rawEvent as { major?: unknown }).major),
      minor: normalizeInteger((rawEvent as { minor?: unknown }).minor),
      cardNo: normalizeNullableText((rawEvent as { cardNo?: unknown }).cardNo),
    })
  }

  const totalMatches = normalizeInteger(
    (payload as { totalMatches?: unknown }).totalMatches,
    events.length,
  )

  return {
    events,
    totalMatches: Math.max(totalMatches, events.length),
  }
}

export function formatMemberEventTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  const parts = getFormatterParts(date, {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const day = parts.get('day')
  const month = parts.get('month')
  const year = parts.get('year')
  const hour = parts.get('hour')
  const minute = parts.get('minute')
  const dayPeriod = parts.get('dayPeriod')

  if (!day || !month || !year || !hour || !minute || !dayPeriod) {
    return 'Not available'
  }

  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod.toLowerCase()}`
}

export async function fetchMemberEvents(
  id: string,
  page: number,
  limit = MEMBER_EVENTS_PAGE_SIZE,
): Promise<MemberEventsResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  const response = await fetch(`/api/members/${id}/events?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: MemberEventsResponse | MemberEventsErrorResponse | null = null

  try {
    responseBody = (await response.json()) as MemberEventsResponse | MemberEventsErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok) {
    throw new Error(
      responseBody && 'error' in responseBody
        ? responseBody.error
        : 'Failed to load member events.',
    )
  }

  return normalizeMemberEventsResponse(responseBody)
}
