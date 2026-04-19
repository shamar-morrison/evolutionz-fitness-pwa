import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import type { MembershipExpiryEmailSettings } from '@/types'

export const MEMBERSHIP_EXPIRY_EMAIL_TEMPLATE_TOKENS = [
  '{{member_name}}',
  '{{expiry_date}}',
  '{{days_until_expiry}}',
] as const

export const DEFAULT_MEMBERSHIP_EXPIRY_EMAIL_SUBJECT_TEMPLATE =
  'Your Evolutionz Fitness membership expires on {{expiry_date}}'

export const DEFAULT_MEMBERSHIP_EXPIRY_EMAIL_BODY_TEMPLATE = `Hi {{member_name}},

This is a reminder that your Evolutionz Fitness membership will expire on {{expiry_date}}.

That is {{days_until_expiry}} day(s) from today.

If you would like to renew, please contact Evolutionz Fitness.

Evolutionz Fitness`

const membershipExpiryEmailLastRunSchema = z.object({
  status: z.enum(['idle', 'running', 'success', 'partial', 'failed']),
  startedAt: z.string().trim().min(1).nullable(),
  completedAt: z.string().trim().min(1).nullable(),
  sentCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  message: z.string().trim().min(1).nullable(),
})

export const membershipExpiryEmailSettingsSchema = z.object({
  enabled: z.boolean(),
  dayOffsets: z.array(z.number().int().positive()).default([]),
  subjectTemplate: z.string().trim().min(1),
  bodyTemplate: z.string().trim().min(1),
  lastRun: membershipExpiryEmailLastRunSchema.nullable(),
})

const membershipExpiryEmailSettingsResponseSchema = z.object({
  settings: membershipExpiryEmailSettingsSchema,
})

export type UpdateMembershipExpiryEmailSettingsInput = {
  enabled: boolean
  dayOffsets: number[]
  subjectTemplate: string
  bodyTemplate: string
}

export function normalizeMembershipExpiryEmailDayOffsets(dayOffsets: number[]) {
  return Array.from(
    new Set(
      dayOffsets
        .map((value) => (Number.isFinite(value) ? Math.trunc(value) : 0))
        .filter((value) => value > 0),
    ),
  ).sort((left, right) => left - right)
}

function trimTemplateValue(value: string) {
  return value.replace(/\r\n/g, '\n').trim()
}

export function normalizeMembershipExpiryEmailSettingsInput(
  input: UpdateMembershipExpiryEmailSettingsInput,
) {
  return {
    enabled: input.enabled,
    dayOffsets: normalizeMembershipExpiryEmailDayOffsets(input.dayOffsets),
    subjectTemplate: trimTemplateValue(input.subjectTemplate),
    bodyTemplate: trimTemplateValue(input.bodyTemplate),
  }
}

export function extractMembershipExpiryEmailTemplateTokens(template: string) {
  const matches = template.match(/{{\s*[a-z_]+\s*}}/gi) ?? []

  return matches.map((token) => token.replace(/\s+/g, ''))
}

export function findUnsupportedMembershipExpiryEmailTemplateTokens(template: string) {
  const supportedTokens = new Set(MEMBERSHIP_EXPIRY_EMAIL_TEMPLATE_TOKENS)

  return Array.from(
    new Set(
      extractMembershipExpiryEmailTemplateTokens(template).filter(
        (token) =>
          !supportedTokens.has(token as (typeof MEMBERSHIP_EXPIRY_EMAIL_TEMPLATE_TOKENS)[number]),
      ),
    ),
  )
}

export async function fetchMembershipExpiryEmailSettings(): Promise<MembershipExpiryEmailSettings> {
  const responseBody = await apiFetch(
    '/api/settings/membership-expiry-emails',
    {
      method: 'GET',
      cache: 'no-store',
    },
    membershipExpiryEmailSettingsResponseSchema,
    'Failed to load membership expiry email settings.',
  )

  return {
    ...responseBody.settings,
    dayOffsets: responseBody.settings.dayOffsets ?? [],
  }
}

export async function updateMembershipExpiryEmailSettings(
  input: UpdateMembershipExpiryEmailSettingsInput,
): Promise<MembershipExpiryEmailSettings> {
  const responseBody = await apiFetch(
    '/api/settings/membership-expiry-emails',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(normalizeMembershipExpiryEmailSettingsInput(input)),
    },
    membershipExpiryEmailSettingsResponseSchema,
    'Failed to update membership expiry email settings.',
  )

  return {
    ...responseBody.settings,
    dayOffsets: responseBody.settings.dayOffsets ?? [],
  }
}
