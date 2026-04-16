import { formatAccessDate, getJamaicaDateInputValue } from '@/lib/member-access-time'
import { JAMAICA_OFFSET } from '@/lib/jamaica-time'

type MembershipExpiryEmailTemplateValues = {
  memberName: string
  expiryDate: string
  daysUntilExpiry: string
}

const CARD_CODE_PREFIX_PATTERN = /^[A-Z]+\d+\s+/
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function replaceAllTokens(template: string, values: MembershipExpiryEmailTemplateValues) {
  return template
    .split('{{member_name}}')
    .join(values.memberName)
    .split('{{expiry_date}}')
    .join(values.expiryDate)
    .split('{{days_until_expiry}}')
    .join(values.daysUntilExpiry)
}

function getDateValue(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())

  return match?.[1] ?? null
}

function buildJamaicaMidnight(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00${JAMAICA_OFFSET}`)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

function getDaysUntilExpiry(endTime: string, now = new Date()) {
  const expiryDateValue = getDateValue(endTime)

  if (!expiryDateValue) {
    return 0
  }

  const todayDateValue = getJamaicaDateInputValue(now)
  const expiryDate = buildJamaicaMidnight(expiryDateValue)
  const todayDate = buildJamaicaMidnight(todayDateValue)

  if (!expiryDate || !todayDate) {
    return 0
  }

  return Math.max(
    0,
    Math.round((expiryDate.getTime() - todayDate.getTime()) / MILLISECONDS_PER_DAY),
  )
}

function normalizeMemberNameForEmail(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  const nameWithoutCardCode = normalizedValue.replace(CARD_CODE_PREFIX_PATTERN, '').trim()

  return nameWithoutCardCode || 'Member'
}

export function buildMembershipExpiryEmailTemplateValues(input: {
  memberName: string | null | undefined
  endTime: string
  now?: Date
}): MembershipExpiryEmailTemplateValues {
  return {
    memberName: normalizeMemberNameForEmail(input.memberName),
    expiryDate: formatAccessDate(input.endTime, 'long'),
    daysUntilExpiry: String(getDaysUntilExpiry(input.endTime, input.now)),
  }
}

export function renderMembershipExpiryEmailTemplate(
  template: string,
  values: MembershipExpiryEmailTemplateValues,
) {
  return replaceAllTokens(template, values)
}

export function buildMembershipExpiryEmailHtml(text: string) {
  return escapeHtml(text).replaceAll('\n', '<br />')
}

export function renderMembershipExpiryEmailContent(input: {
  subjectTemplate: string
  bodyTemplate: string
  memberName: string | null | undefined
  endTime: string
  now?: Date
}) {
  const values = buildMembershipExpiryEmailTemplateValues(input)
  const subject = renderMembershipExpiryEmailTemplate(input.subjectTemplate, values)
  const text = renderMembershipExpiryEmailTemplate(input.bodyTemplate, values)

  return {
    subject,
    text,
    html: buildMembershipExpiryEmailHtml(text),
  }
}
