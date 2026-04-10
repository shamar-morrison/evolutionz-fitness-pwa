import { z } from 'zod'
import {
  DEFAULT_MEMBERSHIP_EXPIRY_EMAIL_BODY_TEMPLATE,
  DEFAULT_MEMBERSHIP_EXPIRY_EMAIL_SUBJECT_TEMPLATE,
  membershipExpiryEmailSettingsSchema,
  normalizeMembershipExpiryEmailDayOffsets,
} from '@/lib/membership-expiry-email-settings'
import type {
  MembershipExpiryEmailLastRun,
  MembershipExpiryEmailLastRunStatus,
  MembershipExpiryEmailSettings,
} from '@/types'

const membershipExpiryEmailSettingsRowSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
  day_offsets: z.array(z.number().int().positive()).default([]),
  subject_template: z.string().trim().min(1),
  body_template: z.string().trim().min(1),
  last_run_status: z.enum(['idle', 'running', 'success', 'partial', 'failed']),
  last_run_started_at: z.string().trim().min(1).nullable(),
  last_run_completed_at: z.string().trim().min(1).nullable(),
  last_run_sent_count: z.number().int().nonnegative(),
  last_run_skipped_count: z.number().int().nonnegative(),
  last_run_duplicate_count: z.number().int().nonnegative(),
  last_run_error_count: z.number().int().nonnegative(),
  last_run_message: z.string().trim().min(1).nullable(),
  created_at: z.string().trim().min(1),
  updated_at: z.string().trim().min(1),
})

export const MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_TABLE = 'membership_expiry_email_settings'
export const MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_ROW_ID = 1

type MembershipExpiryEmailSettingsRow = z.infer<typeof membershipExpiryEmailSettingsRowSchema>

export type MembershipExpiryEmailSettingsWriteInput = {
  enabled: boolean
  dayOffsets: number[]
  subjectTemplate: string
  bodyTemplate: string
}

export type MembershipExpiryEmailLastRunWriteInput = MembershipExpiryEmailLastRun

export type MembershipExpiryEmailSettingsAdminClient = {
  from(table: string): any
}

function buildDefaultMembershipExpiryEmailLastRun(): MembershipExpiryEmailLastRun {
  return {
    status: 'idle',
    startedAt: null,
    completedAt: null,
    sentCount: 0,
    skippedCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    message: null,
  }
}

export function buildDefaultMembershipExpiryEmailSettings(): MembershipExpiryEmailSettings {
  return membershipExpiryEmailSettingsSchema.parse({
    enabled: false,
    dayOffsets: [],
    subjectTemplate: DEFAULT_MEMBERSHIP_EXPIRY_EMAIL_SUBJECT_TEMPLATE,
    bodyTemplate: DEFAULT_MEMBERSHIP_EXPIRY_EMAIL_BODY_TEMPLATE,
    lastRun: null,
  })
}

function mapMembershipExpiryEmailLastRun(
  row: MembershipExpiryEmailSettingsRow,
): MembershipExpiryEmailLastRun | null {
  if (
    row.last_run_status === 'idle' &&
    row.last_run_started_at === null &&
    row.last_run_completed_at === null &&
    row.last_run_message === null &&
    row.last_run_sent_count === 0 &&
    row.last_run_skipped_count === 0 &&
    row.last_run_duplicate_count === 0 &&
    row.last_run_error_count === 0
  ) {
    return null
  }

  return {
    status: row.last_run_status,
    startedAt: row.last_run_started_at,
    completedAt: row.last_run_completed_at,
    sentCount: row.last_run_sent_count,
    skippedCount: row.last_run_skipped_count,
    duplicateCount: row.last_run_duplicate_count,
    errorCount: row.last_run_error_count,
    message: row.last_run_message,
  }
}

function mapMembershipExpiryEmailSettingsRow(
  row: MembershipExpiryEmailSettingsRow | null | undefined,
) {
  if (!row) {
    return buildDefaultMembershipExpiryEmailSettings()
  }

  return membershipExpiryEmailSettingsSchema.parse({
    enabled: row.enabled,
    dayOffsets: normalizeMembershipExpiryEmailDayOffsets(row.day_offsets),
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    lastRun: mapMembershipExpiryEmailLastRun(row),
  })
}

function buildLastRunDatabaseValues(lastRun: MembershipExpiryEmailLastRun) {
  return {
    last_run_status: lastRun.status,
    last_run_started_at: lastRun.startedAt,
    last_run_completed_at: lastRun.completedAt,
    last_run_sent_count: lastRun.sentCount,
    last_run_skipped_count: lastRun.skippedCount,
    last_run_duplicate_count: lastRun.duplicateCount,
    last_run_error_count: lastRun.errorCount,
    last_run_message: lastRun.message,
  }
}

function buildSettingsDatabaseValues(input: MembershipExpiryEmailSettingsWriteInput) {
  return {
    enabled: input.enabled,
    day_offsets: normalizeMembershipExpiryEmailDayOffsets(input.dayOffsets),
    subject_template: input.subjectTemplate.trim(),
    body_template: input.bodyTemplate.replace(/\r\n/g, '\n').trim(),
    updated_at: new Date().toISOString(),
  }
}

async function selectSingleSettingsRow(
  query: PromiseLike<{
    data: MembershipExpiryEmailSettingsRow | null
    error: { message: string } | null
  }>,
  fallbackErrorPrefix: string,
) {
  const { data, error } = await query

  if (error) {
    throw new Error(`${fallbackErrorPrefix}: ${error.message}`)
  }

  return data ? membershipExpiryEmailSettingsRowSchema.parse(data) : null
}

export async function readMembershipExpiryEmailSettings(
  supabase: MembershipExpiryEmailSettingsAdminClient,
) {
  const row = await selectSingleSettingsRow(
    supabase
      .from(MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_TABLE)
      .select('*')
      .eq('id', MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_ROW_ID)
      .maybeSingle(),
    'Failed to read membership expiry email settings',
  )

  return mapMembershipExpiryEmailSettingsRow(row)
}

export async function upsertMembershipExpiryEmailSettings(
  supabase: MembershipExpiryEmailSettingsAdminClient,
  input: MembershipExpiryEmailSettingsWriteInput,
) {
  const row = await selectSingleSettingsRow(
    supabase
      .from(MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_TABLE)
      .upsert(
        {
          id: MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_ROW_ID,
          ...buildSettingsDatabaseValues(input),
        },
        {
          onConflict: 'id',
        },
      )
      .select('*')
      .maybeSingle(),
    'Failed to update membership expiry email settings',
  )

  return mapMembershipExpiryEmailSettingsRow(row)
}

export async function updateMembershipExpiryEmailLastRun(
  supabase: MembershipExpiryEmailSettingsAdminClient,
  lastRun: MembershipExpiryEmailLastRunWriteInput,
) {
  const updateValues = {
    ...buildLastRunDatabaseValues(lastRun),
    updated_at: new Date().toISOString(),
  }

  const updatedRow = await selectSingleSettingsRow(
    supabase
      .from(MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_TABLE)
      .update(updateValues)
      .eq('id', MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_ROW_ID)
      .select('*')
      .maybeSingle(),
    'Failed to update membership expiry email last-run summary',
  )

  if (updatedRow) {
    return mapMembershipExpiryEmailSettingsRow(updatedRow)
  }

  const insertedRow = await selectSingleSettingsRow(
    supabase
      .from(MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_TABLE)
      .upsert(
        {
          id: MEMBERSHIP_EXPIRY_EMAIL_SETTINGS_ROW_ID,
          enabled: false,
          day_offsets: [],
          subject_template: DEFAULT_MEMBERSHIP_EXPIRY_EMAIL_SUBJECT_TEMPLATE,
          body_template: DEFAULT_MEMBERSHIP_EXPIRY_EMAIL_BODY_TEMPLATE,
          ...buildLastRunDatabaseValues(lastRun),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'id',
        },
      )
      .select('*')
      .maybeSingle(),
    'Failed to create membership expiry email settings row',
  )

  return mapMembershipExpiryEmailSettingsRow(insertedRow)
}

export function createMembershipExpiryEmailLastRun(input: {
  status: MembershipExpiryEmailLastRunStatus
  startedAt?: string | null
  completedAt?: string | null
  sentCount?: number
  skippedCount?: number
  duplicateCount?: number
  errorCount?: number
  message?: string | null
}) {
  return {
    ...buildDefaultMembershipExpiryEmailLastRun(),
    ...input,
  }
}
