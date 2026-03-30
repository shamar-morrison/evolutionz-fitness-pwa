import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RESET_SLOT_END_TIME,
  buildAddCardPayload,
  buildAddUserPayload,
  buildAssignSlotPayload,
  buildResetSlotPayload,
  buildSlotBackedMemberPreview,
  generateEmployeeNo,
} from '@/lib/member-job'

describe('member job payload mapping', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds the bridge-native add_user, assign_slot, and add_card payloads', () => {
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
      buildAssignSlotPayload(
        {
          employeeNo: '00000611',
          cardNo: '0102857149',
          placeholderName: 'P42',
          name: '  Jane Doe  ',
          expiry: '2026-07-15',
        },
        now,
      ),
    ).toEqual({
      employeeNo: '00000611',
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

  it('builds reset slot payloads with the far-future supported expiry', () => {
    const now = new Date('2026-03-30T14:15:16')

    expect(
      buildResetSlotPayload(
        {
          employeeNo: '00000611',
          placeholderName: 'P42',
        },
        now,
      ),
    ).toEqual({
      employeeNo: '00000611',
      name: 'P42',
      userType: 'normal',
      beginTime: '2026-03-30T00:00:00',
      endTime: DEFAULT_RESET_SLOT_END_TIME,
    })
  })

  it('builds slot-backed preview members using the existing Hik person and card ids', () => {
    const now = new Date('2026-03-30T14:15:16')

    expect(
      buildSlotBackedMemberPreview(
        {
          name: '  Jane Doe  ',
          type: 'Student/BPO',
          expiry: '2026-07-15',
          slot: {
            employeeNo: '00000611',
            cardNo: ' 0102857149 ',
            placeholderName: 'P42',
          },
        },
        {
          now,
          deviceAccessState: 'released',
        },
      ),
    ).toEqual({
      id: '00000611',
      name: 'Jane Doe',
      cardNo: '0102857149',
      slotPlaceholderName: 'P42',
      type: 'Student/BPO',
      status: 'Active',
      deviceAccessState: 'released',
      expiry: '2026-07-15',
      balance: 0,
      createdAt: now.toISOString(),
    })
  })

  it('still generates a stable prefixed employee number for legacy paths', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    expect(generateEmployeeNo(new Date('2026-03-30T14:15:16'))).toBe(
      'EVZ-20260330141516-ABCDEF',
    )
  })
})
