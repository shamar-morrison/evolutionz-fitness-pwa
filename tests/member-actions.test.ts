import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addMember,
  assignMemberCard,
  deleteMember,
  deleteMemberPhoto,
  recoverMemberCard,
  reactivateMember,
  reportMemberCardLost,
  releaseMemberSlot,
  suspendMember,
  uploadMemberPhoto,
  updateMember,
  unassignMemberCard,
} from '@/lib/member-actions'
import {
  clearSessionMemberOverrides,
  getSessionMemberOverrides,
  upsertSessionMemberOverride,
} from '@/lib/member-session-store'

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
    clearSessionMemberOverrides()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('provisions a selected card and returns the persisted member', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '20260330141516593046',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'A18',
            cardStatus: 'assigned',
            cardLostAt: null,
            type: 'General',
            memberTypeId: 'type-1',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: 'Female',
            email: 'jane@example.com',
            phone: '876-555-1212',
            remark: 'Prefers morning sessions',
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
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
        memberTypeId: 'type-1',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Prefers morning sessions',
        beginTime: '2026-03-30T00:00:00',
        endTime: '2026-07-15T23:59:59',
        cardNo: '0102857149',
        cardCode: 'A18',
      },
      { onStepChange: stepSpy },
    )

    expect(stepSpy.mock.calls).toEqual([['provisioning_member']])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/provision')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      cardNo: '0102857149',
      cardCode: 'A18',
      name: 'Jane Doe',
      type: 'General',
      member_type_id: 'type-1',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Prefers morning sessions',
      beginTime: '2026-03-30T00:00:00',
      endTime: '2026-07-15T23:59:59',
    })
    expect(member).toEqual({
      id: 'member-1',
      employeeNo: '20260330141516593046',
      name: 'Jane Doe',
      cardNo: '0102857149',
      cardCode: 'A18',
      cardStatus: 'assigned',
      cardLostAt: null,
      type: 'General',
      memberTypeId: 'type-1',
      status: 'Active',
      deviceAccessState: 'ready',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Prefers morning sessions',
      photoUrl: null,
      beginTime: '2026-03-30T00:00:00.000Z',
      endTime: '2026-07-15T23:59:59.000Z',
    })
    expect(getSessionMemberOverrides()).toEqual([])
  })

  it('sends member_type_id when direct member creation includes a membership type', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '20260330141516593046',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'A18',
            cardStatus: 'assigned',
            cardLostAt: null,
            type: 'Civil Servant',
            memberTypeId: 'type-2',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await addMember({
        name: 'Jane Doe',
        type: 'Civil Servant',
        memberTypeId: 'type-2',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        beginTime: '2026-03-30T00:00:00',
        endTime: '2026-07-15T23:59:59',
        cardNo: '0102857149',
      cardCode: 'A18',
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      cardNo: '0102857149',
      cardCode: 'A18',
      name: 'Jane Doe',
      type: 'Civil Servant',
      member_type_id: 'type-2',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      beginTime: '2026-03-30T00:00:00',
      endTime: '2026-07-15T23:59:59',
    })
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
        memberTypeId: 'type-1',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        beginTime: '2026-03-30T00:00:00',
        endTime: '2026-07-15T23:59:59',
        cardNo: '0102857149',
        cardCode: 'A18',
      }),
    ).rejects.toMatchObject({
      name: 'MemberProvisioningError',
      step: 'provisioning_member',
    })

    expect(getSessionMemberOverrides()).toEqual([])
  })

  it('suspends a member through the access route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'P42',
            cardStatus: 'assigned',
            cardLostAt: null,
            type: 'General',
            status: 'Suspended',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = await suspendMember({
      id: 'member-1',
      employeeNo: '000611',
      cardNo: '0102857149',
    } as const)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/member-1/suspend')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: '000611',
      cardNo: '0102857149',
    })
    expect(member.status).toBe('Suspended')
  })

  it('assigns a card to an existing member through the access route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'A18',
            cardStatus: 'assigned',
            cardLostAt: null,
            type: 'General',
            status: 'Suspended',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = await assignMemberCard('member-1', {
      cardNo: ' 0102857149 ',
      beginTime: '2026-04-01T00:00:00',
      endTime: '2026-07-15T23:59:59',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/member-1/assign-card')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      cardNo: '0102857149',
      beginTime: '2026-04-01T00:00:00',
      endTime: '2026-07-15T23:59:59',
    })
    expect(member.cardNo).toBe('0102857149')
    expect(member.cardStatus).toBe('assigned')
  })

  it('sends null cardNo when suspending a member without a card', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: null,
            cardCode: null,
            cardStatus: null,
            cardLostAt: null,
            type: 'General',
            status: 'Suspended',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = await suspendMember({
      id: 'member-1',
      employeeNo: '000611',
      cardNo: null,
    } as const)

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: '000611',
      cardNo: null,
    })
    expect(member.cardNo).toBeNull()
  })

  it('reactivates a member through the members patch route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: null,
            cardCode: null,
            cardStatus: null,
            cardLostAt: null,
            type: 'General',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = await reactivateMember('member-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/members/member-1')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      refreshStatus: true,
    })
    expect(member.status).toBe('Active')
  })

  it('updates a member through the edit route and returns warnings when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'A18',
            cardStatus: 'assigned',
            cardLostAt: null,
            type: 'Civil Servant',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: 'Female',
            email: 'jane@example.com',
            phone: '876-555-1212',
            remark: 'Updated remark',
            photoUrl: null,
            beginTime: '2026-03-30T08:00:00.000Z',
            endTime: '2026-04-29T23:59:59.000Z',
          },
          warning: 'Member updated but device sync failed. Please try again.',
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const result = await updateMember('member-1', {
      name: 'Jane Doe',
      memberTypeId: 'type-2',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Updated remark',
      beginTime: '2026-03-30T08:00:00',
      endTime: '2026-04-29T23:59:59',
    })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/members/member-1/edit')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      name: 'Jane Doe',
      member_type_id: 'type-2',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Updated remark',
      beginTime: '2026-03-30T08:00:00',
      endTime: '2026-04-29T23:59:59',
    })
    expect(result.warning).toBe('Member updated but device sync failed. Please try again.')
    expect(result.member.type).toBe('Civil Servant')
  })

  it('omits member_type_id when updating a member without memberTypeId', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'A18',
            cardStatus: 'assigned',
            cardLostAt: null,
            type: 'Civil Servant',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: 'Female',
            email: 'jane@example.com',
            phone: '876-555-1212',
            remark: 'Updated remark',
            photoUrl: null,
            beginTime: '2026-03-30T08:00:00.000Z',
            endTime: '2026-04-29T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await updateMember('member-1', {
      name: 'Jane Doe',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Updated remark',
      beginTime: '2026-03-30T08:00:00',
      endTime: '2026-04-29T23:59:59',
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      name: 'Jane Doe',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Updated remark',
      beginTime: '2026-03-30T08:00:00',
      endTime: '2026-04-29T23:59:59',
    })
  })

  it('sends member_type_id: null when explicitly clearing the member type', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'A18',
            cardStatus: 'assigned',
            cardLostAt: null,
            type: 'Civil Servant',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: 'Female',
            email: 'jane@example.com',
            phone: '876-555-1212',
            remark: 'Updated remark',
            photoUrl: null,
            beginTime: '2026-03-30T08:00:00.000Z',
            endTime: '2026-04-29T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await updateMember('member-1', {
      name: 'Jane Doe',
      memberTypeId: null,
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Updated remark',
      beginTime: '2026-03-30T08:00:00',
      endTime: '2026-04-29T23:59:59',
    })

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      name: 'Jane Doe',
      member_type_id: null,
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Updated remark',
      beginTime: '2026-03-30T08:00:00',
      endTime: '2026-04-29T23:59:59',
    })
  })

  it('uploads a member photo through the photo route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: null,
            cardCode: null,
            cardStatus: null,
            cardLostAt: null,
            type: 'General',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: 'https://signed.example.com/member-1.jpg',
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )
    const photo = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })

    vi.stubGlobal('fetch', fetchMock)

    const member = await uploadMemberPhoto('member-1', photo)
    const requestOptions = fetchMock.mock.calls[0]?.[1] as { body: FormData; method: string }
    const requestPhoto = requestOptions.body.get('photo')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/members/member-1/photo')
    expect(requestOptions.method).toBe('POST')
    expect(requestOptions.body).toBeInstanceOf(FormData)
    expect(requestPhoto).toBeInstanceOf(File)
    expect((requestPhoto as File).name).toBe('member-1.jpg')
    expect((requestPhoto as File).type).toBe('image/jpeg')
    expect(member.photoUrl).toBe('https://signed.example.com/member-1.jpg')
  })

  it('deletes a member photo through the photo route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: null,
            cardCode: null,
            cardStatus: null,
            cardLostAt: null,
            type: 'General',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = await deleteMemberPhoto('member-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/members/member-1/photo')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'DELETE',
    })
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined()
    expect(member.photoUrl).toBeNull()
  })

  it('deletes a member through the member route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteMember('member-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/members/member-1')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'DELETE',
    })
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined()
    expect(result).toEqual({})
  })

  it('returns delete warnings from the member route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          warning: 'The member was deleted, but the device user may need to be manually removed from iVMS.',
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteMember('member-1')).resolves.toEqual({
      warning: 'The member was deleted, but the device user may need to be manually removed from iVMS.',
    })
  })

  it('propagates delete-member API errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: false,
          error: 'Failed to delete member.',
        },
        500,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteMember('member-1')).rejects.toThrow('Failed to delete member.')
  })

  it('unassigns a member card through the access route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: null,
            cardCode: null,
            cardStatus: null,
            cardLostAt: null,
            type: 'General',
            status: 'Suspended',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = await unassignMemberCard({
      id: 'member-1',
      employeeNo: '000611',
      cardNo: '0102857149',
    } as const)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/member-1/unassign-card')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: '000611',
      cardNo: '0102857149',
    })
    expect(member.cardNo).toBeNull()
    expect(member.status).toBe('Suspended')
  })

  it('rejects card unassign when the member has no assigned card', async () => {
    vi.stubGlobal('fetch', vi.fn())

    await expect(
      unassignMemberCard({
        id: 'member-1',
        employeeNo: '000611',
        cardNo: null,
      } as const),
    ).rejects.toThrow('No card assigned.')
  })

  it('reports a member card as lost through the access route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'A18',
            cardStatus: 'suspended_lost',
            cardLostAt: '2026-04-01T05:00:00.000Z',
            type: 'General',
            status: 'Suspended',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = await reportMemberCardLost({
      id: 'member-1',
      employeeNo: '000611',
      cardNo: '0102857149',
    } as const)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/member-1/report-card-lost')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: '000611',
      cardNo: '0102857149',
    })
    expect(member.cardStatus).toBe('suspended_lost')
    expect(member.status).toBe('Suspended')
  })

  it('recovers a lost member card through the access route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          member: {
            id: 'member-1',
            employeeNo: '000611',
            name: 'Jane Doe',
            cardNo: '0102857149',
            cardCode: 'A18',
            cardStatus: 'assigned',
            cardLostAt: null,
            type: 'General',
            status: 'Active',
            deviceAccessState: 'ready',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photoUrl: null,
            beginTime: '2026-03-30T00:00:00.000Z',
            endTime: '2026-07-15T23:59:59.000Z',
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const member = await recoverMemberCard({
      id: 'member-1',
      employeeNo: '000611',
      cardNo: '0102857149',
    } as const)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/members/member-1/recover-card')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: '000611',
      cardNo: '0102857149',
    })
    expect(member.cardStatus).toBe('assigned')
    expect(member.cardLostAt).toBeNull()
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
      cardCode: 'P42',
      cardStatus: 'assigned' as const,
      cardLostAt: null,
      slotPlaceholderName: 'P42',
      type: 'General' as const,
      memberTypeId: null,
      status: 'Active' as const,
      deviceAccessState: 'ready' as const,
      gender: null,
      email: null,
      phone: null,
      remark: null,
      photoUrl: null,
      beginTime: '2026-03-30T00:00:00.000Z',
      endTime: '2026-07-15T23:59:59.000Z',
    }

    upsertSessionMemberOverride(member)

    const releasedMember = await releaseMemberSlot(member)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/slots/reset')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      employeeNo: '00000611',
      placeholderName: 'P42',
    })
    expect(releasedMember.deviceAccessState).toBe('released')
    expect(getSessionMemberOverrides()).toEqual([
      {
        id: '00000611',
        employeeNo: '00000611',
        slotPlaceholderName: 'P42',
        deviceAccessState: 'released',
      },
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
      cardCode: 'P42',
      cardStatus: 'assigned' as const,
      cardLostAt: null,
      slotPlaceholderName: 'P42',
      type: 'General' as const,
      memberTypeId: null,
      status: 'Active' as const,
      deviceAccessState: 'ready' as const,
      gender: null,
      email: null,
      phone: null,
      remark: null,
      photoUrl: null,
      beginTime: '2026-03-30T00:00:00.000Z',
      endTime: '2026-07-15T23:59:59.000Z',
    }

    upsertSessionMemberOverride(member)

    await expect(releaseMemberSlot(member)).rejects.toThrow(
      'Failed to release the Hik slot: Reset failed.',
    )

    expect(getSessionMemberOverrides()).toEqual([
      {
        id: '00000611',
        employeeNo: '00000611',
        slotPlaceholderName: 'P42',
        deviceAccessState: 'ready',
      },
    ])
  })
})
