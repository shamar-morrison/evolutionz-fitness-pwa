import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/access/members/provision/route'

const EXPECTED_EMPLOYEE_NO = '20260330141516593046'

describe('POST /api/access/members/provision', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('queues add_user then add_card and returns the provisioned identifiers', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16'))
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    const { client, insertedJobs } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          expiry: '2026-07-15',
          cardSource: 'inventory',
          cardNo: '0102857149',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: {
          employeeNo: EXPECTED_EMPLOYEE_NO,
          name: 'Jane Doe',
          userType: 'normal',
          beginTime: '2026-03-30T00:00:00',
          endTime: '2026-07-15T23:59:59',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      employeeNo: EXPECTED_EMPLOYEE_NO,
      cardNo: '0102857149',
    })
  })

  it('returns the add_user failure without attempting card assignment', async () => {
    const { client, insertedJobs } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Device rejected request.',
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          expiry: '2026-07-15',
          cardSource: 'inventory',
          cardNo: '0102857149',
        }),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to create the Hik user before card assignment: Device rejected request. Card assignment was not attempted because Hik user creation failed first.',
    })
  })

  it('keeps add_user payloads identical for inventory and manual card sources', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16'))
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    const firstClientState = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
      ],
    })
    const secondClientState = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock
      .mockReturnValueOnce(firstClientState.client)
      .mockReturnValueOnce(secondClientState.client)

    const inventoryResponse = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          expiry: '2026-07-15',
          cardSource: 'inventory',
          cardNo: '0102857149',
        }),
      }),
    )

    const manualResponse = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          expiry: '2026-07-15',
          cardSource: 'manual',
          cardNo: '9998887776',
        }),
      }),
    )

    expect(inventoryResponse.status).toBe(200)
    expect(manualResponse.status).toBe(200)
    expect(firstClientState.insertedJobs[0]).toEqual(secondClientState.insertedJobs[0])
    expect(firstClientState.insertedJobs[1]).toEqual({
      type: 'add_card',
      payload: {
        employeeNo: EXPECTED_EMPLOYEE_NO,
        cardNo: '0102857149',
      },
    })
    expect(secondClientState.insertedJobs[1]).toEqual({
      type: 'add_card',
      payload: {
        employeeNo: EXPECTED_EMPLOYEE_NO,
        cardNo: '9998887776',
      },
    })
  })

  it('rolls back the created user when add_card fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16'))
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    const { client, insertedJobs } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Card setup failed.',
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          expiry: '2026-07-15',
          cardSource: 'inventory',
          cardNo: '0102857149',
        }),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_EMPLOYEE_NO,
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to issue card 0102857149: Card setup failed. The created Hik user was rolled back.',
    })
  })

  it('surfaces rollback failures when add_card fails after user creation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16'))
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    const { client, insertedJobs } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: { accepted: true },
            error: null,
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Card setup failed.',
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Cleanup failed.',
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          expiry: '2026-07-15',
          cardSource: 'inventory',
          cardNo: '0102857149',
        }),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: expect.any(Object),
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_EMPLOYEE_NO,
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to issue card 0102857149: Card setup failed. Rollback failed: Cleanup failed.',
    })
  })

  it('normalizes illegal person id errors from the device', async () => {
    const { client } = createFakeAccessControlClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error:
              'Device returned 400 for PUT /ISAPI/AccessControl/UserInfo/Modify?format=json: {"subStatusCode":"illegalEmployeeNo"}',
          },
          error: null,
        },
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
        body: JSON.stringify({
          name: 'Jane Doe',
          expiry: '2026-07-15',
          cardSource: 'manual',
          cardNo: '0102857149',
        }),
      }),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to create the Hik user before card assignment: The Hik device rejected the generated person ID. Please try again. The manually entered card number was not yet sent to CardInfo/Modify because Hik user creation failed first.',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[access] Hik rejected generated person ID:',
      'Device returned 400 for PUT /ISAPI/AccessControl/UserInfo/Modify?format=json: {"subStatusCode":"illegalEmployeeNo"}',
    )
  })
})
