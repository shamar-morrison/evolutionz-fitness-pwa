import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addMember,
  retryMemberCard,
} from '@/lib/member-actions'
import { clearSessionMembers, getSessionMembers, upsertSessionMember } from '@/lib/member-session-store'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('member actions', () => {
  afterEach(() => {
    clearSessionMembers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('completes add_user then add_card and stores a ready member', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16'))

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ ok: true, jobId: 'user-job', result: { ok: true } }, 200))
      .mockResolvedValueOnce(createJsonResponse({ ok: true, jobId: 'card-job', result: { ok: true } }, 200))
    const stepSpy = vi.fn()

    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    const member = await addMember(
      {
        name: 'Jane Doe',
        cardNo: 'EF-009999',
        type: 'General',
        expiry: '2026-07-15',
      },
      { onStepChange: stepSpy },
    )

    expect(stepSpy.mock.calls).toEqual([['creating_member'], ['issuing_card']])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/user')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: 'EVZ-20260330141516-ABCDEF',
      name: 'Jane Doe',
      expiry: '2026-07-15',
    })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/access/members/card')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      employeeNo: 'EVZ-20260330141516-ABCDEF',
      cardNo: 'EF-009999',
    })
    expect(member.deviceAccessState).toBe('ready')
    expect(getSessionMembers()).toEqual([member])
  })

  it('stores a card_pending member and throws a step-specific error when add_card fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16'))

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ ok: true, jobId: 'user-job', result: { ok: true } }, 200))
      .mockResolvedValueOnce(
        createJsonResponse({ ok: false, jobId: 'card-job', error: 'Card setup failed.' }, 502),
      )

    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    await expect(
      addMember({
        name: 'Jane Doe',
        cardNo: 'EF-009999',
        type: 'General',
        expiry: '2026-07-15',
      }),
    ).rejects.toMatchObject({
      name: 'MemberProvisioningError',
      step: 'issuing_card',
      member: {
        id: 'EVZ-20260330141516-ABCDEF',
        deviceAccessState: 'card_pending',
      },
    })

    expect(getSessionMembers()).toEqual([
      expect.objectContaining({
        id: 'EVZ-20260330141516-ABCDEF',
        deviceAccessState: 'card_pending',
      }),
    ])
  })

  it('retries card issuance and transitions the member to ready', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({ ok: true, jobId: 'card-job', result: { ok: true } }, 200),
    )

    vi.stubGlobal('fetch', fetchMock)

    const pendingMember = {
      id: 'EVZ-20260330141516-ABCDEF',
      name: 'Jane Doe',
      cardNo: 'EF-009999',
      type: 'General' as const,
      status: 'Active' as const,
      deviceAccessState: 'card_pending' as const,
      expiry: '2026-07-15',
      balance: 0,
      createdAt: '2026-03-30T14:15:16.000Z',
    }

    upsertSessionMember(pendingMember)

    const member = await retryMemberCard(pendingMember)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/card')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: 'EVZ-20260330141516-ABCDEF',
      cardNo: 'EF-009999',
    })
    expect(member.deviceAccessState).toBe('ready')
    expect(getSessionMembers()).toEqual([
      expect.objectContaining({
        id: 'EVZ-20260330141516-ABCDEF',
        deviceAccessState: 'ready',
      }),
    ])
  })
})
