import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import {
  GET as getMembershipExpiryEmailSettings,
  PATCH as patchMembershipExpiryEmailSettings,
} from '@/app/api/settings/membership-expiry-emails/route'

type SettingsRow = {
  id: number
  enabled: boolean
  day_offsets: number[]
  subject_template: string
  body_template: string
  last_run_status: 'idle' | 'running' | 'success' | 'partial' | 'failed'
  last_run_started_at: string | null
  last_run_completed_at: string | null
  last_run_sent_count: number
  last_run_skipped_count: number
  last_run_duplicate_count: number
  last_run_error_count: number
  last_run_message: string | null
  created_at: string
  updated_at: string
}

function createSettingsRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    id: overrides.id ?? 1,
    enabled: overrides.enabled ?? false,
    day_offsets: overrides.day_offsets ?? [],
    subject_template:
      overrides.subject_template ?? 'Your Evolutionz Fitness membership expires on {{expiry_date}}',
    body_template:
      overrides.body_template ??
      'Hi {{member_name}},\n\nThis is a reminder that your membership expires on {{expiry_date}}.',
    last_run_status: overrides.last_run_status ?? 'idle',
    last_run_started_at: overrides.last_run_started_at ?? null,
    last_run_completed_at: overrides.last_run_completed_at ?? null,
    last_run_sent_count: overrides.last_run_sent_count ?? 0,
    last_run_skipped_count: overrides.last_run_skipped_count ?? 0,
    last_run_duplicate_count: overrides.last_run_duplicate_count ?? 0,
    last_run_error_count: overrides.last_run_error_count ?? 0,
    last_run_message: overrides.last_run_message ?? null,
    created_at: overrides.created_at ?? '2026-04-10T00:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-04-10T00:00:00.000Z',
  }
}

function createMembershipExpiryEmailSettingsClient(options: {
  row?: SettingsRow | null
  readError?: { message: string } | null
  upsertError?: { message: string } | null
} = {}) {
  let row = options.row ?? createSettingsRow()
  const upsertCalls: Array<{
    values: Record<string, unknown>
    options: { onConflict: string }
  }> = []

  return {
    upsertCalls,
    client: {
      from(table: string) {
        expect(table).toBe('membership_expiry_email_settings')

        return {
          select(columns: string) {
            expect(columns).toBe('*')

            return {
              eq(column: string, value: number) {
                expect(column).toBe('id')
                expect(value).toBe(1)

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: row,
                      error: options.readError ?? null,
                    })
                  },
                }
              },
            }
          },
          upsert(values: Record<string, unknown>, upsertOptions: { onConflict: string }) {
            upsertCalls.push({
              values,
              options: upsertOptions,
            })
            row = {
              ...(row ?? createSettingsRow()),
              ...(values as Partial<SettingsRow>),
            }

            return {
              select(columns: string) {
                expect(columns).toBe('*')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: row,
                      error: options.upsertError ?? null,
                    })
                  },
                }
              },
            }
          },
        }
      },
    },
  }
}

describe('membership expiry email settings routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the current membership expiry email settings for admins', async () => {
    const client = createMembershipExpiryEmailSettingsClient({
      row: createSettingsRow({
        enabled: true,
        day_offsets: [1, 7],
        last_run_status: 'success',
        last_run_started_at: '2026-04-10T11:00:00.000Z',
        last_run_completed_at: '2026-04-10T11:00:30.000Z',
        last_run_sent_count: 4,
        last_run_skipped_count: 1,
        last_run_duplicate_count: 0,
        last_run_error_count: 0,
        last_run_message: '4 sent, 1 skipped, 0 duplicates, 0 errors',
      }),
    })

    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await getMembershipExpiryEmailSettings()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      settings: {
        enabled: true,
        dayOffsets: [1, 7],
        subjectTemplate: 'Your Evolutionz Fitness membership expires on {{expiry_date}}',
        bodyTemplate:
          'Hi {{member_name}},\n\nThis is a reminder that your membership expires on {{expiry_date}}.',
        lastRun: {
          status: 'success',
          startedAt: '2026-04-10T11:00:00.000Z',
          completedAt: '2026-04-10T11:00:30.000Z',
          sentCount: 4,
          skippedCount: 1,
          duplicateCount: 0,
          errorCount: 0,
          message: '4 sent, 1 skipped, 0 duplicates, 0 errors',
        },
      },
    })
  })

  it('returns 401 when settings are requested without an admin session', async () => {
    mockUnauthorized()

    const response = await getMembershipExpiryEmailSettings()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('updates membership expiry email settings for admins', async () => {
    const client = createMembershipExpiryEmailSettingsClient()
    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await patchMembershipExpiryEmailSettings(
      new Request('http://localhost/api/settings/membership-expiry-emails', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: true,
          dayOffsets: [7, 1],
          subjectTemplate: ' Reminder for {{member_name}} ',
          bodyTemplate: 'Hello {{member_name}}\r\nExpiry: {{expiry_date}}',
        }),
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      settings: {
        enabled: true,
        dayOffsets: [1, 7],
        subjectTemplate: 'Reminder for {{member_name}}',
        bodyTemplate: 'Hello {{member_name}}\nExpiry: {{expiry_date}}',
        lastRun: null,
      },
    })
    expect(client.upsertCalls).toHaveLength(1)
    expect(client.upsertCalls[0]).toEqual({
      values: expect.objectContaining({
        id: 1,
        enabled: true,
        day_offsets: [1, 7],
        subject_template: 'Reminder for {{member_name}}',
        body_template: 'Hello {{member_name}}\nExpiry: {{expiry_date}}',
        updated_at: expect.any(String),
      }),
      options: {
        onConflict: 'id',
      },
    })
  })

  it('returns 401 when the settings update is requested without a session', async () => {
    mockUnauthorized()

    const response = await patchMembershipExpiryEmailSettings(
      new Request('http://localhost/api/settings/membership-expiry-emails', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: true,
          dayOffsets: [7],
          subjectTemplate: 'Reminder',
          bodyTemplate: 'Hello',
        }),
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 403 when a non-admin attempts to update the reminder settings', async () => {
    mockForbidden()

    const response = await patchMembershipExpiryEmailSettings(
      new Request('http://localhost/api/settings/membership-expiry-emails', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: true,
          dayOffsets: [7],
          subjectTemplate: 'Reminder',
          bodyTemplate: 'Hello',
        }),
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('rejects invalid JSON bodies', async () => {
    const response = await patchMembershipExpiryEmailSettings(
      new Request('http://localhost/api/settings/membership-expiry-emails', {
        method: 'PATCH',
        body: '{',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid JSON body.',
    })
  })

  it('rejects enabling reminders without at least one day offset', async () => {
    const response = await patchMembershipExpiryEmailSettings(
      new Request('http://localhost/api/settings/membership-expiry-emails', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: true,
          dayOffsets: [],
          subjectTemplate: 'Reminder',
          bodyTemplate: 'Hello',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'At least one reminder day offset is required when reminders are enabled.',
    })
  })

  it('rejects unsupported template tokens', async () => {
    const response = await patchMembershipExpiryEmailSettings(
      new Request('http://localhost/api/settings/membership-expiry-emails', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: false,
          dayOffsets: [],
          subjectTemplate: 'Reminder for {{unknown_token}}',
          bodyTemplate: 'Hello {{member_name}}',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Unsupported template tokens: {{unknown_token}}.',
    })
  })
})
