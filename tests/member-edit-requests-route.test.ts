import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockForbidden,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  getSupabaseAdminClientMock,
  insertNotificationsMock,
  readAdminNotificationRecipientsMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  getSupabaseAdminClientMock: vi.fn(),
  insertNotificationsMock: vi.fn().mockResolvedValue(undefined),
  readAdminNotificationRecipientsMock: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/pt-notifications-server', () => ({
  archiveResolvedRequestNotifications: archiveResolvedRequestNotificationsMock,
  insertNotifications: insertNotificationsMock,
  readAdminNotificationRecipients: readAdminNotificationRecipientsMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET, POST } from '@/app/api/member-edit-requests/route'
import { PATCH } from '@/app/api/member-edit-requests/[id]/route'
import {
  MEMBER_EDIT_REQUEST_SELECT,
  type MemberEditRequestRecord,
} from '@/lib/member-edit-request-records'
import { MEMBER_RECORD_SELECT } from '@/lib/members'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'
import type { MemberTypeRecord } from '@/types'

const MEMBER_TYPE_ID_GENERAL = '11111111-1111-4111-8111-111111111111'
const MEMBER_TYPE_ID_CIVIL_SERVANT = '22222222-2222-4222-8222-222222222222'
const MEMBER_ID = '33333333-3333-4333-8333-333333333333'

function createMemberTypeRecord(overrides: Partial<MemberTypeRecord> = {}): MemberTypeRecord {
  return {
    id: overrides.id ?? MEMBER_TYPE_ID_GENERAL,
    name: overrides.name ?? 'General',
    monthly_rate: overrides.monthly_rate ?? 12000,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
  }
}

function createEditRequestRecord(
  overrides: Partial<MemberEditRequestRecord> = {},
): MemberEditRequestRecord {
  return {
    id: overrides.id ?? 'request-1',
    member_id: overrides.member_id ?? MEMBER_ID,
    requested_by: overrides.requested_by ?? 'staff-1',
    status: overrides.status ?? 'pending',
    proposed_name: overrides.proposed_name === undefined ? 'Jane Updated' : overrides.proposed_name,
    proposed_gender: overrides.proposed_gender === undefined ? null : overrides.proposed_gender,
    proposed_phone: overrides.proposed_phone === undefined ? null : overrides.proposed_phone,
    proposed_email: overrides.proposed_email === undefined ? null : overrides.proposed_email,
    proposed_member_type_id:
      overrides.proposed_member_type_id === undefined ? null : overrides.proposed_member_type_id,
    proposed_start_date:
      overrides.proposed_start_date === undefined ? null : overrides.proposed_start_date,
    proposed_start_time:
      overrides.proposed_start_time === undefined ? null : overrides.proposed_start_time,
    proposed_duration:
      overrides.proposed_duration === undefined ? null : overrides.proposed_duration,
    reviewed_by: overrides.reviewed_by === undefined ? null : overrides.reviewed_by,
    reviewed_at: overrides.reviewed_at === undefined ? null : overrides.reviewed_at,
    rejection_reason:
      overrides.rejection_reason === undefined ? null : overrides.rejection_reason,
    created_at: overrides.created_at ?? '2026-04-11T10:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-04-11T10:00:00.000Z',
    member: overrides.member ?? {
      id: MEMBER_ID,
      name: 'Jane Doe',
      gender: 'Female',
      phone: '555-0100',
      email: 'jane@example.com',
      member_type_id: MEMBER_TYPE_ID_GENERAL,
      begin_time: '2026-04-01T00:00:00Z',
      end_time: '2026-04-30T23:59:59Z',
      memberType: {
        name: 'General',
      },
    },
    requestedByProfile: overrides.requestedByProfile === undefined ? {
      name: 'Jordan Staff',
    } : overrides.requestedByProfile,
    reviewedByProfile:
      overrides.reviewedByProfile === undefined ? null : overrides.reviewedByProfile,
    proposedMemberType:
      overrides.proposedMemberType === undefined ? null : overrides.proposedMemberType,
  }
}

function createEditRequestsClient({
  requestRows = [createEditRequestRecord()],
  existingRequestRow = createEditRequestRecord(),
  insertedRequestRow = createEditRequestRecord(),
  currentMemberRow = {
    id: MEMBER_ID,
    employee_no: '000611',
    name: 'A18 Jane Doe',
    card_no: '0102857149',
    type: 'General',
    member_type_id: MEMBER_TYPE_ID_GENERAL,
    status: 'Active',
    gender: 'Female',
    email: 'jane@example.com',
    phone: '555-0100',
    remark: null,
    photo_url: null,
    begin_time: '2026-04-01T00:00:00Z',
    end_time: '2026-04-30T23:59:59Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  },
  memberTypeRow = createMemberTypeRecord({
    id: MEMBER_TYPE_ID_CIVIL_SERVANT,
    name: 'Civil Servant',
    monthly_rate: 7500,
  }),
  cardRows = [{ card_no: '0102857149', card_code: 'A18', status: 'assigned', lost_at: null }],
  requestUpdateError = null,
  pollResults,
}: {
  requestRows?: MemberEditRequestRecord[]
  existingRequestRow?: MemberEditRequestRecord | null
  insertedRequestRow?: MemberEditRequestRecord
  currentMemberRow?: Record<string, unknown> | null
  memberTypeRow?: MemberTypeRecord | null
  cardRows?: Array<Record<string, unknown>>
  requestUpdateError?: { message: string } | null
  pollResults?: Array<{
    data: {
      id: string
      status: 'pending' | 'processing' | 'done' | 'failed'
      result: unknown
      error: string | null
    } | null
    error: { message: string } | null
  }>
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    pollResults,
  })
  const operations: string[] = []
  const requestInserts: Array<Record<string, unknown>> = []
  const requestUpdates: Array<Record<string, unknown>> = []
  const memberUpdates: Array<Record<string, unknown>> = []

  return {
    insertedJobs,
    memberUpdates,
    operations,
    requestInserts,
    requestUpdates,
    client: {
      from(table: string) {
        if (table === 'access_control_jobs') {
          return accessControlClient.from('access_control_jobs')
        }

        if (table === 'member_edit_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe(MEMBER_EDIT_REQUEST_SELECT)

              return {
                eq(column: string, value: string) {
                  if (column === 'status') {
                    expect(value).toBe('pending')

                    return {
                      order(orderColumn: string, options: { ascending: boolean }) {
                        expect(orderColumn).toBe('created_at')
                        expect(options).toEqual({ ascending: true })

                        return Promise.resolve({
                          data: requestRows,
                          error: null,
                        })
                      },
                    }
                  }

                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: existingRequestRow,
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            insert(values: Record<string, unknown>) {
              requestInserts.push(values)

              return {
                select(columns: string) {
                  expect(columns).toBe(MEMBER_EDIT_REQUEST_SELECT)

                  return {
                    single() {
                      return Promise.resolve({
                        data: insertedRequestRow,
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            update(values: Record<string, unknown>) {
              requestUpdates.push(values)
              operations.push('request-update')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return Promise.resolve({
                    data: null,
                    error: requestUpdateError,
                  })
                },
              }
            },
          }
        }

        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe(MEMBER_RECORD_SELECT)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(MEMBER_ID)

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: currentMemberRow,
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            update(values: Record<string, unknown>) {
              memberUpdates.push(values)
              operations.push('member-update')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(MEMBER_ID)

                  return {
                    select(columns: string) {
                      expect(columns).toBe('id')

                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: { id: value },
                            error: null,
                          })
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'cards') {
          return {
            select(columns: string) {
              expect(columns).toBe('card_no, card_code, status, lost_at')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('card_no')
                  expect(values).toEqual(['0102857149'])

                  return Promise.resolve({
                    data: cardRows,
                    error: null,
                  })
                },
              }
            },
          }
        }

        if (table === 'member_types') {
          return {
            select(columns: string) {
              expect(columns).toBe('*')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: memberTypeRow && memberTypeRow.id === value ? memberTypeRow : null,
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('member edit request routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    getSupabaseAdminClientMock.mockReset()
    insertNotificationsMock.mockClear()
    readAdminNotificationRecipientsMock.mockReset()
    readAdminNotificationRecipientsMock.mockResolvedValue([])
    resetServerAuthMocks()
  })

  it('returns pending member edit requests for admins ordered oldest first', async () => {
    const requestRows = [
      createEditRequestRecord({
        id: 'request-1',
        created_at: '2026-04-11T09:00:00.000Z',
      }),
      createEditRequestRecord({
        id: 'request-2',
        created_at: '2026-04-11T10:00:00.000Z',
      }),
    ]
    const { client } = createEditRequestsClient({ requestRows })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requests: [
        expect.objectContaining({ id: 'request-1' }),
        expect.objectContaining({ id: 'request-2' }),
      ],
    })
  })

  it('rejects non-admin users from reading pending member edit requests', async () => {
    mockForbidden()

    const response = await GET()

    expect(response.status).toBe(403)
  })

  it('creates a pending member edit request for the authenticated user', async () => {
    const { client, requestInserts } = createEditRequestsClient({
      insertedRequestRow: createEditRequestRecord({
        proposed_email: 'jane-updated@example.com',
        proposed_name: 'Jane Updated',
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ])
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-edit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          proposed_name: 'Jane Updated',
          proposed_email: 'jane-updated@example.com',
        }),
      }),
    )

    expect(requestInserts).toEqual([
      {
        member_id: MEMBER_ID,
        requested_by: 'staff-auth-1',
        status: 'pending',
        proposed_name: 'Jane Updated',
        proposed_email: 'jane-updated@example.com',
      },
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      {
        recipientId: 'admin-1',
        type: 'member_edit_request',
        title: 'Member Edit Request',
        body: 'New member edit request from Jordan Staff.',
        metadata: {
          requestId: 'request-1',
          memberId: MEMBER_ID,
          memberName: 'Jane Doe',
          requestedBy: 'Jordan Staff',
        },
      },
      {
        recipientId: 'admin-2',
        type: 'member_edit_request',
        title: 'Member Edit Request',
        body: 'New member edit request from Jordan Staff.',
        metadata: {
          requestId: 'request-1',
          memberId: MEMBER_ID,
          memberName: 'Jane Doe',
          requestedBy: 'Jordan Staff',
        },
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        id: 'request-1',
        proposedName: 'Jane Updated',
        proposedEmail: 'jane-updated@example.com',
      }),
    })
  })

  it('creates a pending member edit request with access window fields', async () => {
    const { client, requestInserts } = createEditRequestsClient({
      insertedRequestRow: createEditRequestRecord({
        proposed_start_date: '2026-04-05',
        proposed_start_time: '08:30:00',
        proposed_duration: '3 Months',
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([])
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-edit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          proposed_start_date: '2026-04-05',
          proposed_start_time: '08:30:00',
          proposed_duration: '3 Months',
        }),
      }),
    )

    expect(requestInserts).toEqual([
      {
        member_id: MEMBER_ID,
        requested_by: 'staff-auth-1',
        status: 'pending',
        proposed_start_date: '2026-04-05',
        proposed_start_time: '08:30:00',
        proposed_duration: '3 Months',
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        proposedStartDate: '2026-04-05',
        proposedStartTime: '08:30:00',
        proposedDuration: '3 Months',
      }),
    })
  })

  it('logs and ignores member edit notification delivery failures after create', async () => {
    const { client } = createEditRequestsClient({
      insertedRequestRow: createEditRequestRecord({
        proposed_email: 'jane-updated@example.com',
        proposed_name: 'Jane Updated',
      }),
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    insertNotificationsMock.mockRejectedValueOnce(new Error('Notification insert failed.'))
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([{ id: 'admin-1' }])
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-edit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          proposed_name: 'Jane Updated',
          proposed_email: 'jane-updated@example.com',
        }),
      }),
    )

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to send member edit request notifications:',
      expect.any(Error),
    )
    expect(response.status).toBe(200)
  })

  it('returns 400 when no proposed changes are provided', async () => {
    const { client } = createEditRequestsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-edit-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('At least one proposed field is required.'),
    })
  })

  it('denies a pending member edit request', async () => {
    const { client, requestUpdates } = createEditRequestsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-edit-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deny',
          rejectionReason: 'Need supporting details.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(requestUpdates).toEqual([
      {
        status: 'denied',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        rejection_reason: 'Need supporting details.',
      },
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'request-1',
      type: 'member_edit_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('approves a pending member edit request and updates only the proposed fields', async () => {
    const existingRequestRow = createEditRequestRecord({
      proposed_name: 'Jane Updated',
      proposed_email: 'jane-updated@example.com',
      proposed_member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      proposedMemberType: {
        name: 'Civil Servant',
      },
    })
    const { client, memberUpdates, operations, requestUpdates } = createEditRequestsClient({
      existingRequestRow,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-edit-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(memberUpdates).toEqual([
      {
        name: 'A18 Jane Updated',
        email: 'jane-updated@example.com',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        type: 'Civil Servant',
      },
    ])
    expect(operations).toEqual(['request-update', 'member-update'])
    expect(requestUpdates).toEqual([
      {
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
      },
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'request-1',
      type: 'member_edit_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('does not update the member when approving the request status fails', async () => {
    const existingRequestRow = createEditRequestRecord({
      proposed_name: 'Jane Updated',
    })
    const { client, memberUpdates, requestUpdates } = createEditRequestsClient({
      existingRequestRow,
      requestUpdateError: { message: 'request update failed' },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-edit-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(requestUpdates).toEqual([
      {
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
      },
    ])
    expect(memberUpdates).toEqual([])
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to approve member edit request request-1: request update failed',
    })
  })

  it('logs and ignores member edit notification archive failures after denial', async () => {
    const { client } = createEditRequestsClient()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    archiveResolvedRequestNotificationsMock.mockRejectedValueOnce(new Error('Archive failed.'))
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-edit-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deny',
          rejectionReason: 'Need supporting details.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to archive resolved member edit request notifications:',
      expect.any(Error),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('approves a partial access window request using the current duration and syncs the device', async () => {
    const existingRequestRow = createEditRequestRecord({
      proposed_name: null,
      proposed_start_time: '08:30:00',
      member: {
        id: MEMBER_ID,
        name: 'Jane Doe',
        gender: 'Female',
        phone: '555-0100',
        email: 'jane@example.com',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        begin_time: '2026-04-01T00:00:00Z',
        end_time: '2026-04-28T23:59:59Z',
        memberType: {
          name: 'General',
        },
      },
    })
    const { client, insertedJobs, memberUpdates, requestUpdates } = createEditRequestsClient({
      existingRequestRow,
      currentMemberRow: {
        id: MEMBER_ID,
        employee_no: '000611',
        name: 'A18 Jane Doe',
        card_no: '0102857149',
        type: 'General',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        status: 'Active',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '555-0100',
        remark: null,
        photo_url: null,
        begin_time: '2026-04-01T00:00:00Z',
        end_time: '2026-04-28T23:59:59Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-edit-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(memberUpdates).toEqual([
      {
        begin_time: '2026-04-01T08:30:00',
        end_time: '2026-04-28T23:59:59',
      },
    ])
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: {
          employeeNo: '000611',
          name: 'A18 Jane Doe',
          userType: 'normal',
          beginTime: '2026-04-01T08:30:00',
          endTime: '2026-04-28T23:59:59',
        },
      },
    ])
    expect(requestUpdates).toEqual([
      {
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('approves a full access window request and syncs the device with the final values', async () => {
    const existingRequestRow = createEditRequestRecord({
      proposed_name: 'Jane Updated',
      proposed_start_date: '2026-04-05',
      proposed_start_time: '08:30:00',
      proposed_duration: '3 Months',
    })
    const { client, insertedJobs, memberUpdates, requestUpdates } = createEditRequestsClient({
      existingRequestRow,
      currentMemberRow: {
        id: MEMBER_ID,
        employee_no: '000611',
        name: 'A18 Jane Doe',
        card_no: '0102857149',
        type: 'General',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        status: 'Active',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '555-0100',
        remark: null,
        photo_url: null,
        begin_time: '2026-04-01T00:00:00Z',
        end_time: '2026-04-28T23:59:59Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-edit-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(memberUpdates).toEqual([
      {
        name: 'A18 Jane Updated',
        begin_time: '2026-04-05T08:30:00',
        end_time: '2026-06-27T23:59:59',
      },
    ])
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: {
          employeeNo: '000611',
          name: 'A18 Jane Updated',
          userType: 'normal',
          beginTime: '2026-04-05T08:30:00',
          endTime: '2026-06-27T23:59:59',
        },
      },
    ])
    expect(requestUpdates).toEqual([
      {
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('approves an access window request without syncing when the effective window is unchanged', async () => {
    const existingRequestRow = createEditRequestRecord({
      proposed_name: null,
      proposed_duration: '1 Month',
    })
    const { client, insertedJobs, memberUpdates, requestUpdates } = createEditRequestsClient({
      existingRequestRow,
      currentMemberRow: {
        id: MEMBER_ID,
        employee_no: '000611',
        name: 'A18 Jane Doe',
        card_no: '0102857149',
        type: 'General',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        status: 'Active',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '555-0100',
        remark: null,
        photo_url: null,
        begin_time: '2026-04-01T00:00:00Z',
        end_time: '2026-04-28T23:59:59Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-edit-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(memberUpdates).toEqual([
      {
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-04-28T23:59:59',
      },
    ])
    expect(insertedJobs).toEqual([])
    expect(requestUpdates).toEqual([
      {
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
