import { addDays } from 'date-fns'
import {
  formatDateInputValue,
  getJamaicaDateInputValue,
  parseDateInputValue,
} from '@/lib/member-access-time'

export type DateRangeValue = {
  startDate: string
  endDate: string
}

function createRange(startDate: Date, endDate: Date): DateRangeValue {
  return {
    startDate: formatDateInputValue(startDate),
    endDate: formatDateInputValue(endDate),
  }
}

function getJamaicaCalendarDate(now: Date) {
  const dateValue = getJamaicaDateInputValue(now)
  const parsedDate = parseDateInputValue(dateValue)

  if (!parsedDate) {
    throw new Error('Failed to resolve the current Jamaica calendar date.')
  }

  return parsedDate
}

export function getThisWeekRange(now = new Date()): DateRangeValue {
  const jamaicaToday = getJamaicaCalendarDate(now)
  const dayOfWeek = jamaicaToday.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const startDate = addDays(jamaicaToday, -daysFromMonday)
  const endDate = addDays(startDate, 6)

  return createRange(startDate, endDate)
}

export function getThisMonthRange(now = new Date()): DateRangeValue {
  const jamaicaToday = getJamaicaCalendarDate(now)
  const year = jamaicaToday.getFullYear()
  const month = jamaicaToday.getMonth()
  const startDate = new Date(year, month, 1, 12, 0, 0, 0)
  const endDate = new Date(year, month + 1, 0, 12, 0, 0, 0)

  return createRange(startDate, endDate)
}

export function getThisYearRange(now = new Date()): DateRangeValue {
  const year = getJamaicaCalendarDate(now).getFullYear()
  const startDate = new Date(year, 0, 1, 12, 0, 0, 0)
  const endDate = new Date(year, 11, 31, 12, 0, 0, 0)

  return createRange(startDate, endDate)
}
