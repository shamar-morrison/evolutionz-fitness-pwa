import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addMember,
  releaseMemberSlot,
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

  it('provisions a selected card and stores a ready member', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-30T14:15:16'))

    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          employeeNo: '20260330141516593046',
          cardNo: '0102857149',
        },
        200,
      ),
    )
    const stepSpy = vi.fn()

    vi.stubGlobal('fetch', fetchMock)

    const member = await addMember(
      {
        name: 'Jane Doe',
        type: 'General',
        expiry: '2026-07-15',
        cardSource: 'inventory',
        cardNo: '0102857149',
      },
      { onStepChange: stepSpy },
    )

    expect(stepSpy.mock.calls).toEqual([['provisioning_member']])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/provision')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      cardNo: '0102857149',
      cardSource: 'inventory',
      name: 'Jane Doe',
      expiry: '2026-07-15',
    })
    expect(member).toEqual({
      id: '20260330141516593046',
      employeeNo: '20260330141516593046',
      name: 'Jane Doe',
      cardNo: '0102857149',
      type: 'General',
      status: 'Active',
      deviceAccessState: 'ready',
      expiry: '2026-07-15',
      balance: 0,
      createdAt: new Date('2026-03-30T14:15:16').toISOString(),
    })
    expect(getSessionMembers()).toEqual([member])
  })

  it('throws a step-specific error when member provisioning fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        { ok: false, error: 'Failed to issue card 0102857149: Card setup failed.' },
        502,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      addMember({
        name: 'Jane Doe',
        type: 'General',
        expiry: '2026-07-15',
        cardSource: 'manual',
        cardNo: '0102857149',
      }),
    ).rejects.toMatchObject({
      name: 'MemberProvisioningError',
      step: 'provisioning_member',
    })

    expect(getSessionMembers()).toEqual([])
  })

  it('releases a member slot and stores the released state', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({ ok: true, jobId: 'reset-job', result: { ok: true } }, 200),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = {
      id: '00000611',
      employeeNo: '00000611',
      name: 'Jane Doe',
      cardNo: '0102857149',
      slotPlaceholderName: 'P42',
      type: 'General' as const,
      status: 'Active' as const,
      deviceAccessState: 'ready' as const,
      expiry: '2026-07-15',
      balance: 0,
      createdAt: '2026-03-30T14:15:16.000Z',
    }

    upsertSessionMember(member)

    const releasedMember = await releaseMemberSlot(member)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/slots/reset')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: '00000611',
      placeholderName: 'P42',
    })
    expect(releasedMember.deviceAccessState).toBe('released')
    expect(getSessionMembers()).toEqual([
      expect.objectContaining({
        id: '00000611',
        employeeNo: '00000611',
        deviceAccessState: 'released',
      }),
    ])
  })

  it('does not update session state when slot release fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({ ok: false, jobId: 'reset-job', error: 'Reset failed.' }, 502),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = {
      id: '00000611',
      employeeNo: '00000611',
      name: 'Jane Doe',
      cardNo: '0102857149',
      slotPlaceholderName: 'P42',
      type: 'General' as const,
      status: 'Active' as const,
      deviceAccessState: 'ready' as const,
      expiry: '2026-07-15',
      balance: 0,
      createdAt: '2026-03-30T14:15:16.000Z',
    }

    upsertSessionMember(member)

    await expect(releaseMemberSlot(member)).rejects.toThrow(
      'Failed to release the Hik slot: Reset failed.',
    )

    expect(getSessionMembers()).toEqual([member])
  })
})
