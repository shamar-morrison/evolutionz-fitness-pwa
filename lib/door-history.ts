import { addDays } from 'date-fns'
import { JAMAICA_OFFSET, JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'
import { formatDateInputValue, getJamaicaDateInputValue, parseDateInputValue } from '@/lib/member-access-time'
import { convertHikEventTimeToJamaicaIso } from '@/lib/member-events'
import type { DoorHistoryEvent, DoorHistoryResponse } from '@/types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const THIRTY_MINUTES_MS = 30 * 60 * 1000

type DoorHistoryErrorResponse = {
  ok?: false
  error: string
}

type DoorHistoryDateParseResult =
  | {
      ok: true
      date: string
    }
  | {
      ok: false
      error: string
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

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase()

    if (['true', '1', 'yes', 'y'].includes(normalizedValue)) {
      return true
    }

    if (['false', '0', 'no', 'n'].includes(normalizedValue)) {
      return false
    }
  }

  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeList<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return [] as T[]
  }

  return Array.isArray(value) ? value : [value]
}

function readStringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeText(record[key])

    if (value) {
      return value
    }
  }

  return null
}

function readNumberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const numericValue = Number(value.trim())

      if (Number.isFinite(numericValue)) {
        return numericValue
      }
    }
  }

  return null
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

function normalizeFetchedAt(value: unknown) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  const parsedValue = new Date(normalizedValue)

  if (Number.isNaN(parsedValue.getTime())) {
    return null
  }

  return parsedValue.toISOString()
}

function isGrantedMinorCode(minor: number | null) {
  return minor === 1
}

function getDoorHistoryFallbackEventType(minor: number | null, accessGranted: boolean) {
  switch (minor) {
    case 1:
      return 'Access granted'
    case 2:
      return 'Invalid card'
    case 3:
      return 'Expired access'
    case 8:
      return 'Access denied'
    case 75:
      return 'Not in whitelist'
    default:
      return accessGranted ? 'Access granted' : 'Access denied'
  }
}

function resolveDoorHistoryAccessGranted(record: Record<string, unknown>) {
  const explicitBooleanKeys = ['accessGranted', 'granted', 'isAccessGranted']

  for (const key of explicitBooleanKeys) {
    if (typeof record[key] === 'boolean') {
      return record[key] as boolean
    }
  }

  const explicitResult = readStringField(record, ['status', 'eventResult', 'accessResult'])

  if (explicitResult) {
    const normalizedResult = explicitResult.toLowerCase()

    if (['granted', 'allowed', 'success', 'passed', 'pass', 'ok'].includes(normalizedResult)) {
      return true
    }

    if (['denied', 'failed', 'failure', 'rejected', 'forbidden'].includes(normalizedResult)) {
      return false
    }
  }

  const minor = readNumberField(record, ['minor'])

  return isGrantedMinorCode(minor)
}

function resolveDoorHistoryDoorName(record: Record<string, unknown>) {
  const directValue = readStringField(record, [
    'doorName',
    'door_name',
    'doorNoName',
    'doorNumberName',
    'readerName',
  ])

  if (directValue) {
    return directValue
  }

  const doorNo = readNumberField(record, ['doorNo', 'door_no'])

  if (doorNo === null) {
    return null
  }

  return `Door ${doorNo}`
}

function resolveDoorHistoryEventType(
  record: Record<string, unknown>,
  accessGranted: boolean,
) {
  const directValue = readStringField(record, [
    'eventType',
    'event_type',
    'eventName',
    'eventDescription',
    'minorDescription',
    'minorName',
    'description',
  ])

  if (directValue) {
    return directValue
  }

  return getDoorHistoryFallbackEventType(readNumberField(record, ['minor']), accessGranted)
}

function normalizeDoorHistoryEventFromDevice(input: unknown): DoorHistoryEvent | null {
  if (!isRecord(input)) {
    return null
  }

  const time = convertHikEventTimeToJamaicaIso(normalizeText(input.time))

  if (!time) {
    return null
  }

  const accessGranted = resolveDoorHistoryAccessGranted(input)

  return {
    cardNo: readStringField(input, ['cardNo', 'card_no']) ?? '',
    cardCode: normalizeNullableText(input.cardCode ?? input.card_code),
    memberName: null,
    time,
    accessGranted,
    doorName: resolveDoorHistoryDoorName(input),
    eventType: resolveDoorHistoryEventType(input, accessGranted),
  }
}

function normalizeCachedDoorHistoryEvent(input: unknown): DoorHistoryEvent | null {
  if (!isRecord(input)) {
    return null
  }

  const time = normalizeText(input.time)

  if (!time || Number.isNaN(Date.parse(time))) {
    return null
  }

  return {
    cardNo: normalizeText(input.cardNo),
    cardCode: normalizeNullableText(input.cardCode),
    memberName: normalizeNullableText(input.memberName),
    time,
    accessGranted: normalizeBoolean(input.accessGranted),
    doorName: normalizeNullableText(input.doorName),
    eventType: normalizeNullableText(input.eventType),
  }
}

export function sortDoorHistoryEvents(events: DoorHistoryEvent[]) {
  return [...events].sort((leftEvent, rightEvent) => {
    const leftTime = Date.parse(leftEvent.time)
    const rightTime = Date.parse(rightEvent.time)

    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
      return 0
    }

    if (Number.isNaN(leftTime)) {
      return 1
    }

    if (Number.isNaN(rightTime)) {
      return -1
    }

    return rightTime - leftTime
  })
}

export function getDoorHistoryTodayDateValue(now = new Date()) {
  return getJamaicaDateInputValue(now)
}

export function parseDoorHistoryDateInput(
  value: unknown,
  now = new Date(),
): DoorHistoryDateParseResult {
  const normalizedValue = normalizeText(value)

  if (!DATE_PATTERN.test(normalizedValue)) {
    return {
      ok: false,
      error: 'date must use YYYY-MM-DD format.',
    }
  }

  if (!parseDateInputValue(normalizedValue)) {
    return {
      ok: false,
      error: 'date must be a valid calendar date.',
    }
  }

  if (normalizedValue > getDoorHistoryTodayDateValue(now)) {
    return {
      ok: false,
      error: 'date cannot be in the future.',
    }
  }

  return {
    ok: true,
    date: normalizedValue,
  }
}

export function buildDoorHistoryDayBounds(dateValue: string) {
  const startDate = parseDateInputValue(dateValue)

  if (!startDate) {
    throw new Error('Failed to build the requested Jamaica door-history day window.')
  }

  const endDateValue = formatDateInputValue(addDays(startDate, 1))

  return {
    startTime: `${dateValue}T00:00:00${JAMAICA_OFFSET}`,
    endTime: `${endDateValue}T00:00:00${JAMAICA_OFFSET}`,
  }
}

export function normalizeDoorHistoryDeviceResult(input: unknown) {
  const payload = isRecord(input) ? input : {}
  const acsEvent = isRecord(payload.AcsEvent) ? payload.AcsEvent : payload
  const rawEvents =
    'events' in payload ? normalizeList(payload.events) : normalizeList(acsEvent.InfoList)
  const events = rawEvents
    .map((event) => normalizeDoorHistoryEventFromDevice(event))
    .filter((event): event is DoorHistoryEvent => event !== null)
  const rawTotalMatches = 'totalMatches' in payload ? payload.totalMatches : acsEvent.totalMatches

  return {
    events: sortDoorHistoryEvents(events),
    totalMatches: Math.max(normalizeInteger(rawTotalMatches, events.length), events.length),
  }
}

export function normalizeCachedDoorHistoryEvents(input: unknown) {
  const events = normalizeList(input)
    .map((event) => normalizeCachedDoorHistoryEvent(event))
    .filter((event): event is DoorHistoryEvent => event !== null)

  return sortDoorHistoryEvents(events)
}

export function normalizeDoorHistoryResponse(
  input: unknown,
  fallbackDate = '',
): DoorHistoryResponse {
  const payload = isRecord(input) ? input : {}
  const events = normalizeCachedDoorHistoryEvents(payload.events)

  return {
    ok: true,
    events,
    fetchedAt: normalizeFetchedAt(payload.fetchedAt),
    totalMatches: Math.max(normalizeInteger(payload.totalMatches), events.length),
    cacheDate: normalizeText(payload.cacheDate) || fallbackDate,
  }
}

export function formatDoorHistoryEventTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  const parts = getFormatterParts(date, {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
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

export function formatDoorHistoryFetchedAt(value: string | null) {
  if (!value) {
    return 'Not recorded'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not recorded'
  }

  const parts = getFormatterParts(date, {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
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
    return 'Not recorded'
  }

  return `${day} ${month} ${year} at ${hour}:${minute} ${dayPeriod.toLowerCase()}`
}

async function parseJsonResponse<T>(response: Response) {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

function getResponseErrorMessage(
  responseBody: DoorHistoryErrorResponse | DoorHistoryResponse | null,
  fallbackMessage: string,
) {
  if (responseBody && 'error' in responseBody && typeof responseBody.error === 'string') {
    return responseBody.error
  }

  return fallbackMessage
}

export async function fetchDoorHistory(date: string) {
  const searchParams = new URLSearchParams({ date })
  const response = await fetch(`/api/door-history?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const responseBody = await parseJsonResponse<DoorHistoryResponse | DoorHistoryErrorResponse>(
    response,
  )

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(responseBody, 'Failed to load door history.'))
  }

  return normalizeDoorHistoryResponse(responseBody, date)
}

export async function refreshDoorHistory(date: string) {
  const response = await fetch('/api/door-history/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({ date }),
  })
  const responseBody = await parseJsonResponse<DoorHistoryResponse | DoorHistoryErrorResponse>(
    response,
  )

  if (!response.ok) {
    throw new Error(getResponseErrorMessage(responseBody, 'Failed to refresh door history.'))
  }

  return normalizeDoorHistoryResponse(responseBody, date)
}

export const DOOR_HISTORY_QUERY_STALE_TIME_MS = THIRTY_MINUTES_MS
