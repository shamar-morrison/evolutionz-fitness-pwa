import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/access/members/provision/route'

const FIXED_NOW = new Date('2026-03-30T14:15:16')
const EXPECTED_INCREMENTED_EMPLOYEE_NO = '912'
const EXPECTED_FALLBACK_EMPLOYEE_NO = '898116000'
const DEFAULT_MEMBER_ROWS = [
  { employee_no: '611' },
  { employee_no: '00000911' },
  { employee_no: '20260330141516593046' },
]
const VALID_PROVISION_REQUEST_BODY = {
  name: 'Jane Doe',
  type: 'General',
  gender: 'Female',
  email: 'jane@example.com',
  phone: '876-555-1212',
  remark: 'Prefers morning sessions',
  beginTime: '2026-03-30T00:00:00',
  endTime: '2026-07-15T23:59:59',
  cardNo: '0102857149',
  cardCode: 'A18',
} as const

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createDoneJobResult(result: unknown = { accepted: true }) {
  return {
    data: {
      id: 'job-123',
      status: 'done' as const,
      result,
      error: null,
    },
    error: null,
  }
}

function createFailedJobResult(error: string) {
  return {
    data: {
      id: 'job-123',
      status: 'failed' as const,
      result: null,
      error,
    },
    error: null,
  }
}

function createProvisioningAdminClient({
  pollResults = [
    createDoneJobResult(),
    createDoneJobResult({
      CardInfoSearch: {
        CardInfo: [],
      },
    }),
    createDoneJobResult(),
  ],
  assignCardResult = {
    data: {
      card_no: '0102857149',
      card_code: 'A18',
    },
    error: null,
  } satisfies QueryResult<{ card_no: string; card_code: string | null }>,
  restoreCardResult = {
    data: {
      card_no: '0102857149',
      card_code: 'A18',
    },
    error: null,
  } satisfies QueryResult<{ card_no: string; card_code: string | null }>,
  memberRows = DEFAULT_MEMBER_ROWS,
  memberRowsResult = {
    data: memberRows,
    error: null,
  } satisfies QueryResult<Array<{ employee_no: string | null }>>,
  insertMemberResult = {
    data: {
      id: 'member-1',
      employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
      name: 'A18 Jane Doe',
      card_no: '0102857149',
      type: 'General',
      status: 'Active',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Prefers morning sessions',
      photo_url: null,
      begin_time: '2026-03-30T00:00:00Z',
      end_time: '2026-07-15T23:59:59Z',
      balance: 0,
      created_at: '2026-03-30T14:15:16Z',
      updated_at: '2026-03-30T14:15:16Z',
    },
    error: null,
  } satisfies QueryResult<Record<string, unknown>>,
}: {
  pollResults?: Array<QueryResult<{
    id: string
    status: 'pending' | 'processing' | 'done' | 'failed'
    result: unknown
    error: string | null
  }>>
  assignCardResult?: QueryResult<{ card_no: string; card_code: string | null }>
  restoreCardResult?: QueryResult<{ card_no: string; card_code: string | null }>
  memberRows?: Array<{ employee_no: string | null }>
  memberRowsResult?: QueryResult<Array<{ employee_no: string | null }>>
  insertMemberResult?: QueryResult<Record<string, unknown>>
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    pollResults,
  })
  const cardUpdates: Array<{
    values: { status: 'available' | 'assigned'; employee_no: string | null }
    filters: Array<{ column: string; value: string }>
    columns: string
  }> = []
  const insertedMembers: Array<Record<string, unknown>> = []

  const client = {
    from(table: string) {
      if (table === 'access_control_jobs') {
        return accessControlClient.from('access_control_jobs')
      }

      if (table === 'cards') {
        return {
          update(values: { status: 'available' | 'assigned'; employee_no: string | null }) {
            const filters: Array<{ column: string; value: string }> = []

            const query = {
              eq(column: string, value: string) {
                filters.push({ column, value })
                return query
              },
              select(columns: string) {
                return {
                  maybeSingle: () => {
                    cardUpdates.push({
                      values,
                      filters: [...filters],
                      columns,
                    })

                    return Promise.resolve(
                      values.status === 'assigned' ? assignCardResult : restoreCardResult,
                    )
                  },
                }
              },
            }

            return query
          },
        }
      }

      if (table === 'members') {
        return {
          select(columns: string) {
            expect(columns).toBe('employee_no')
            return Promise.resolve(memberRowsResult)
          },
          insert(values: Record<string, unknown>) {
            insertedMembers.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe(
                  'id, employee_no, name, card_no, type, status, gender, email, phone, remark, photo_url, begin_time, end_time, balance, created_at, updated_at',
                )

                return {
                  single: () => Promise.resolve(insertMemberResult),
                }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return {
    client,
    insertedJobs,
    cardUpdates,
    insertedMembers,
  }
}

describe('POST /api/access/members/provision', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('queues add_user then add_card, persists the member, and returns the normalized member', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, cardUpdates, insertedMembers } = createProvisioningAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          userType: 'normal',
          beginTime: '2026-03-30T00:00:00',
          endTime: '2026-07-15T23:59:59',
        },
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
    ])
    expect(cardUpdates).toEqual([
      {
        values: {
          status: 'assigned',
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
        filters: [
          { column: 'card_no', value: '0102857149' },
          { column: 'status', value: 'available' },
        ],
        columns: 'card_no, card_code',
      },
    ])
    expect(insertedMembers).toEqual([
      {
        employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        name: 'A18 Jane Doe',
        card_no: '0102857149',
        type: 'General',
        status: 'Active',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Prefers morning sessions',
        photo_url: null,
        begin_time: '2026-03-30T00:00:00',
        end_time: '2026-07-15T23:59:59',
        balance: 0,
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-1',
        employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        name: 'Jane Doe',
        cardNo: '0102857149',
        cardCode: 'A18',
        type: 'General',
        status: 'Active',
        deviceAccessState: 'ready',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Prefers morning sessions',
        photoUrl: null,
        beginTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
        balance: 0,
        createdAt: '2026-03-30T14:15:16.000Z',
      },
    })
  })

  it('falls back to the last 9 digits of Date.now() when no short numeric employee ids exist', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, insertedMembers } = createProvisioningAdminClient({
      memberRows: [{ employee_no: '20260330141516593046' }, { employee_no: '20260330141516593047' }],
      insertMemberResult: {
        data: {
          id: 'member-1',
          employee_no: EXPECTED_FALLBACK_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          card_no: '0102857149',
          type: 'General',
          status: 'Active',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1212',
          remark: 'Prefers morning sessions',
          photo_url: null,
          begin_time: '2026-03-30T00:00:00Z',
          end_time: '2026-07-15T23:59:59Z',
          balance: 0,
          created_at: '2026-03-30T14:15:16Z',
          updated_at: '2026-03-30T14:15:16Z',
        },
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(200)
    expect(insertedJobs[0]).toEqual({
      type: 'add_user',
      payload: expect.objectContaining({
        employeeNo: EXPECTED_FALLBACK_EMPLOYEE_NO,
        endTime: '2026-07-15T23:59:59',
      }),
    })
    expect(insertedMembers).toEqual([
      expect.objectContaining({
        employee_no: EXPECTED_FALLBACK_EMPLOYEE_NO,
      }),
    ])
  })

  it('returns the add_user failure without attempting card assignment', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, cardUpdates, insertedMembers } = createProvisioningAdminClient({
      pollResults: [createFailedJobResult('Device rejected request.')],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
    ])
    expect(cardUpdates).toEqual([])
    expect(insertedMembers).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to create the Hik user before card assignment: Device rejected request. Card assignment was not attempted because Hik user creation failed first.',
    })
  })

  it('returns 400 when the selected card is missing its card code', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createProvisioningAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...VALID_PROVISION_REQUEST_BODY,
          cardCode: '  ',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Card code is required.'),
    })
  })

  it('returns 400 and queues no jobs when the selected end time is already in the past', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, cardUpdates, insertedMembers } = createProvisioningAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...VALID_PROVISION_REQUEST_BODY,
          beginTime: '2026-03-30T00:00:00',
          endTime: '2026-03-30T12:00:00',
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([])
    expect(cardUpdates).toEqual([])
    expect(insertedMembers).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'End time must be in the future.',
    })
  })

  it('returns 400 and queues no jobs when end time is not after begin time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, cardUpdates, insertedMembers } = createProvisioningAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...VALID_PROVISION_REQUEST_BODY,
          beginTime: '2026-07-15T23:59:59',
          endTime: '2026-07-15T23:59:59',
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([])
    expect(cardUpdates).toEqual([])
    expect(insertedMembers).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'End time must be after begin time.',
    })
  })

  it('returns 400 and queues no jobs when the selected start date is in the past', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, cardUpdates, insertedMembers } = createProvisioningAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...VALID_PROVISION_REQUEST_BODY,
          beginTime: '2026-03-29T00:00:00',
          endTime: '2026-07-15T23:59:59',
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([])
    expect(cardUpdates).toEqual([])
    expect(insertedMembers).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Begin time date must be today or later.',
    })
  })

  it('rolls back the device user and card assignment when member persistence fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, cardUpdates, insertedMembers } = createProvisioningAdminClient({
      insertMemberResult: {
        data: null,
        error: { message: 'insert exploded' },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(500)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
      },
    ])
    expect(cardUpdates).toEqual([
      {
        values: {
          status: 'assigned',
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
        filters: [
          { column: 'card_no', value: '0102857149' },
          { column: 'status', value: 'available' },
        ],
        columns: 'card_no, card_code',
      },
      {
        values: {
          status: 'available',
          employee_no: null,
        },
        filters: [{ column: 'card_no', value: '0102857149' }],
        columns: 'card_no',
      },
    ])
    expect(insertedMembers).toEqual([
      {
        employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        name: 'A18 Jane Doe',
        card_no: '0102857149',
        type: 'General',
        status: 'Active',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Prefers morning sessions',
        photo_url: null,
        begin_time: '2026-03-30T00:00:00',
        end_time: '2026-07-15T23:59:59',
        balance: 0,
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to persist member record: insert exploded. The created Hik user was rolled back.',
    })
  })

  it('treats a missing or unavailable Supabase card row as a persistence failure', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, cardUpdates, insertedMembers } = createProvisioningAdminClient({
      assignCardResult: {
        data: null,
        error: null,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(500)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
      },
    ])
    expect(cardUpdates).toEqual([
      {
        values: {
          status: 'assigned',
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
        filters: [
          { column: 'card_no', value: '0102857149' },
          { column: 'status', value: 'available' },
        ],
        columns: 'card_no, card_code',
      },
    ])
    expect(insertedMembers).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to persist assigned card 0102857149: selected card is not available in Supabase. The created Hik user was rolled back.',
    })
  })

  it('surfaces rollback failures when add_card fails after user creation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs } = createProvisioningAdminClient({
      pollResults: [
        createDoneJobResult(),
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [],
          },
        }),
        createFailedJobResult('Card setup failed.'),
        createFailedJobResult('Cleanup failed.'),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to issue card 0102857149: Card setup failed. Rollback failed: Cleanup failed.',
    })
  })

  it('rolls back without persisting when add_card completes with a Hik failure response', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, cardUpdates, insertedMembers } = createProvisioningAdminClient({
      pollResults: [
        createDoneJobResult(),
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [],
          },
        }),
        createDoneJobResult({
          type: 'ResponseStatus',
          statusCode: 6,
          statusString: 'Invalid Content',
          subStatusCode: 'badParameters',
          errorMsg: '0x60000001',
        }),
        createDoneJobResult(),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
      },
    ])
    expect(cardUpdates).toEqual([])
    expect(insertedMembers).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to issue card 0102857149: Device reported unsuccessful card assignment response (statusCode=6, statusString=Invalid Content, subStatusCode=badParameters, errorMsg=0x60000001). The created Hik user was rolled back.',
    })
  })

  it('normalizes illegal person id errors from the device', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client } = createProvisioningAdminClient({
      pollResults: [
        createFailedJobResult(
          'Device returned 400 for PUT /ISAPI/AccessControl/UserInfo/Modify?format=json: {"subStatusCode":"illegalEmployeeNo"}',
        ),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to create the Hik user before card assignment: The Hik device rejected the generated person ID. Please try again. Card assignment was not attempted because Hik user creation failed first.',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[access] Hik rejected generated person ID:',
      'Device returned 400 for PUT /ISAPI/AccessControl/UserInfo/Modify?format=json: {"subStatusCode":"illegalEmployeeNo"}',
    )
  })

  it('revokes a placeholder-held card before assigning it to the new member', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs } = createProvisioningAdminClient({
      pollResults: [
        createDoneJobResult(),
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [
              {
                cardNo: '0102857149',
                employeeNo: '136',
              },
            ],
          },
        }),
        createDoneJobResult(),
        createDoneJobResult(),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const responsePromise = POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
    ])

    await vi.advanceTimersByTimeAsync(1_999)

    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
    ])

    await vi.advanceTimersByTimeAsync(1)

    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
    ])
  })

  it('rolls back the created user when get_card fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs } = createProvisioningAdminClient({
      pollResults: [
        createDoneJobResult(),
        createFailedJobResult('Card lookup failed.'),
        createDoneJobResult(),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to check card 0102857149: Card lookup failed. The created Hik user was rolled back.',
    })
  })

  it('rolls back the created user when revoke_card fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs } = createProvisioningAdminClient({
      pollResults: [
        createDoneJobResult(),
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [
              {
                cardNo: '0102857149',
                employeeNo: '136',
              },
            ],
          },
        }),
        createFailedJobResult('Card release failed.'),
        createDoneJobResult(),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(VALID_PROVISION_REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to release card 0102857149 from Hik user 136: Card release failed. The created Hik user was rolled back.',
    })
  })
})
