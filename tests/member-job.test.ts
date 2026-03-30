import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAddCardPayload,
  buildAddUserPayload,
  buildMemberPreview,
  generateEmployeeNo,
} from '@/lib/member-job'

describe('member job payload mapping', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds the bridge-native add_user and add_card payloads', () => {
    const now = new Date('2026-03-30T14:15:16')

    expect(
      buildAddUserPayload(
        {
          employeeNo: 'EVZ-20260330141516-ABC123',
          name: '  Jane Doe  ',
          expiry: '2026-07-15',
        },
        now,
      ),
    ).toEqual({
      employeeNo: 'EVZ-20260330141516-ABC123',
      name: 'Jane Doe',
      userType: 'normal',
      beginTime: '2026-03-30T00:00:00',
      endTime: '2026-07-15T23:59:59',
    })

    expect(
      buildAddCardPayload({
        employeeNo: 'EVZ-20260330141516-ABC123',
        cardNo: ' EF-009999 ',
      }),
    ).toEqual({
      employeeNo: 'EVZ-20260330141516-ABC123',
      cardNo: 'EF-009999',
    })
  })

  it('builds preview members with a separate device access state', () => {
    const now = new Date('2026-03-30T14:15:16')

    expect(
      buildMemberPreview(
        {
          name: '  Jane Doe  ',
          cardNo: ' EF-009999 ',
          type: 'Student/BPO',
          expiry: '2026-07-15',
        },
        {
          now,
          employeeNo: 'EVZ-20260330141516-ABC123',
          deviceAccessState: 'card_pending',
        },
      ),
    ).toEqual({
      id: 'EVZ-20260330141516-ABC123',
      name: 'Jane Doe',
      cardNo: 'EF-009999',
      type: 'Student/BPO',
      status: 'Active',
      deviceAccessState: 'card_pending',
      expiry: '2026-07-15',
      balance: 0,
      createdAt: now.toISOString(),
    })
  })

  it('generates a stable prefixed employee number', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    expect(generateEmployeeNo(new Date('2026-03-30T14:15:16'))).toBe(
      'EVZ-20260330141516-ABCDEF',
    )
  })
})
