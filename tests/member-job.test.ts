import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RESET_SLOT_END_TIME,
  addMemberRequestSchema,
  assignAccessSlotJobRequestSchema,
  availableAccessCardSchema,
  availableAccessSlotSchema,
  buildAddCardPayload,
  buildAddUserPayload,
  buildAssignSlotPayload,
  buildMemberPreview,
  buildResetSlotPayload,
  buildSlotBackedMemberPreview,
  generateEmployeeNo,
  provisionMemberAccessRequestSchema,
  resetAccessSlotJobRequestSchema,
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
          employeeNo: '20260330141516593046',
          name: '  Jane Doe  ',
          expiry: '2026-07-15',
        },
        now,
      ),
    ).toEqual({
      employeeNo: '20260330141516593046',
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
        employeeNo: '20260330141516593046',
        cardNo: ' EF-009999 ',
      }),
    ).toEqual({
      employeeNo: '20260330141516593046',
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
      employeeNo: '00000611',
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

  it('builds card-backed preview members without reusable slot metadata', () => {
    const now = new Date('2026-03-30T14:15:16')

    expect(
      buildMemberPreview(
        {
          name: '  Jane Doe  ',
          type: 'General',
          expiry: '2026-07-15',
          cardSource: 'manual',
          cardNo: ' 0102857149 ',
        },
        {
          now,
          employeeNo: '20260330141516593046',
        },
      ),
    ).toEqual({
      id: '20260330141516593046',
      employeeNo: '20260330141516593046',
      name: 'Jane Doe',
      cardNo: '0102857149',
      type: 'General',
      status: 'Active',
      deviceAccessState: 'ready',
      expiry: '2026-07-15',
      balance: 0,
      createdAt: now.toISOString(),
    })
  })

  it('generates a stable numeric Hik person id', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'abcdef12-3456-7890-abcd-ef1234567890',
    )

    const employeeNo = generateEmployeeNo(new Date('2026-03-30T14:15:16'))

    expect(employeeNo).toBe('20260330141516593046')
    expect(employeeNo).toMatch(/^\d+$/)
    expect(employeeNo.startsWith('20260330141516')).toBe(true)
    expect(employeeNo.length).toBe(20)
    expect(employeeNo.length).toBeLessThan(32)
  })

  it('accepts card-first member requests and manual card provisioning requests', () => {
    expect(
      availableAccessCardSchema.parse({
        cardNo: '0105451261',
      }),
    ).toEqual({
      cardNo: '0105451261',
    })

    expect(
      addMemberRequestSchema.parse({
        name: 'Jane Doe',
        type: 'General',
        expiry: '2026-07-15',
        cardSource: 'inventory',
        cardNo: '0105451261',
      }),
    ).toEqual({
      name: 'Jane Doe',
      type: 'General',
      expiry: '2026-07-15',
      cardSource: 'inventory',
      cardNo: '0105451261',
    })

    expect(
      provisionMemberAccessRequestSchema.parse({
        name: 'Jane Doe',
        expiry: '2026-07-15',
        cardSource: 'manual',
        cardNo: ' 0105451261 ',
      }),
    ).toEqual({
      name: 'Jane Doe',
      expiry: '2026-07-15',
      cardSource: 'manual',
      cardNo: '0105451261',
    })
  })

  it('rejects manual card numbers with embedded control characters', () => {
    expect(() =>
      addMemberRequestSchema.parse({
        name: 'Jane Doe',
        type: 'General',
        expiry: '2026-07-15',
        cardSource: 'manual',
        cardNo: '0102\n857149',
      }),
    ).toThrow(/Manual card numbers cannot contain control characters or line breaks\./)

    expect(() =>
      provisionMemberAccessRequestSchema.parse({
        name: 'Jane Doe',
        expiry: '2026-07-15',
        cardSource: 'manual',
        cardNo: '0102\u0000857149',
      }),
    ).toThrow(/Manual card numbers cannot contain control characters or line breaks\./)
  })

  it('accepts exact one-digit and two-digit Hik slot labels', () => {
    expect(
      availableAccessSlotSchema.parse({
        employeeNo: '00000624',
        cardNo: '0105451261',
        placeholderName: 'P4',
      }),
    ).toEqual({
      employeeNo: '00000624',
      cardNo: '0105451261',
      placeholderName: 'P4',
    })

    expect(
      assignAccessSlotJobRequestSchema.parse({
        employeeNo: '00000655',
        cardNo: '0105555555',
        placeholderName: 'P55',
        name: 'Jane Doe',
        expiry: '2026-07-15',
      }),
    ).toEqual({
      employeeNo: '00000655',
      cardNo: '0105555555',
      placeholderName: 'P55',
      name: 'Jane Doe',
      expiry: '2026-07-15',
    })

    expect(
      resetAccessSlotJobRequestSchema.parse({
        employeeNo: '00000655',
        placeholderName: 'P55',
      }),
    ).toEqual({
      employeeNo: '00000655',
      placeholderName: 'P55',
    })
  })

  it('rejects member-attached slot names for assign and reset flows', () => {
    expect(() =>
      assignAccessSlotJobRequestSchema.parse({
        employeeNo: '00000624',
        cardNo: '0105451261',
        placeholderName: 'P4 Ackeem Planter',
        name: 'Ackeem Planter',
        expiry: '2026-07-15',
      }),
    ).toThrow(/Placeholder slot name must match the Hik slot pattern\./)

    expect(() =>
      resetAccessSlotJobRequestSchema.parse({
        employeeNo: '00000655',
        placeholderName: 'P55 Waxsley Stewart-Betty',
      }),
    ).toThrow(/Placeholder slot name must match the Hik slot pattern\./)
  })
})
