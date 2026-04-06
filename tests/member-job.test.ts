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
  ensureUniqueShortEmployeeNo,
  generateEmployeeNo,
  getNextShortEmployeeNo,
  provisionMemberAccessRequestSchema,
  resetAccessSlotJobRequestSchema,
} from '@/lib/member-job'

const FIXED_NOW = new Date('2026-03-30T14:15:16.000Z')

describe('member job payload mapping', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds the bridge-native add_user, assign_slot, and add_card payloads', () => {
    const now = FIXED_NOW

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
      name: 'P42 Jane Doe',
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
    const now = FIXED_NOW

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
    const now = FIXED_NOW

    expect(
      buildSlotBackedMemberPreview(
        {
          name: '  Jane Doe  ',
          type: 'Student/BPO',
          beginTime: '2026-03-30T00:00:00',
          endTime: '2026-07-15T23:59:59',
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
      cardCode: 'P42',
      cardStatus: 'assigned',
      cardLostAt: null,
      slotPlaceholderName: 'P42',
      type: 'Student/BPO',
      status: 'Active',
      deviceAccessState: 'released',
      gender: null,
      email: null,
      phone: null,
      remark: null,
      photoUrl: null,
      beginTime: '2026-03-30T00:00:00',
      endTime: '2026-07-15T23:59:59',
    })
  })

  it('builds card-backed preview members without reusable slot metadata', () => {
    const now = FIXED_NOW

    expect(
      buildMemberPreview(
        {
          name: '  Jane Doe  ',
          type: 'General',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1212',
          remark: 'Prefers morning sessions',
          beginTime: '2026-03-30T00:00:00',
          endTime: '2026-07-15T23:59:59',
          cardNo: ' 0102857149 ',
          cardCode: ' A18 ',
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
      cardCode: 'A18',
      cardStatus: 'assigned',
      cardLostAt: null,
      type: 'General',
      status: 'Active',
      deviceAccessState: 'ready',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Prefers morning sessions',
      photoUrl: null,
      beginTime: '2026-03-30T00:00:00',
      endTime: '2026-07-15T23:59:59',
    })
  })

  it('generates a stable short numeric Hik person id fallback', () => {
    const employeeNo = generateEmployeeNo(FIXED_NOW)

    expect(employeeNo).toBe('880116000')
    expect(employeeNo).toMatch(/^\d{1,9}$/)
  })

  it('derives the next short employee id from existing short numeric members and ignores legacy ids', () => {
    expect(
      getNextShortEmployeeNo(
        ['611', '00000911', '20260330141516593046', 'abc-123'],
        '898116000',
      ),
    ).toBe('912')
  })

  it('increments fallback collisions and fails when the short numeric range is exhausted', () => {
    expect(
      ensureUniqueShortEmployeeNo('898116000', ['898116000', '898116001', '20260330141516593046']),
    ).toBe('898116002')

    expect(() => ensureUniqueShortEmployeeNo('999999999', ['999999999'])).toThrow(
      /Failed to derive a unique short numeric employee number\./,
    )
  })

  it('accepts card-first member requests with card codes', () => {
    expect(
      availableAccessCardSchema.parse({
        cardNo: '0105451261',
        cardCode: 'A18',
      }),
    ).toEqual({
      cardNo: '0105451261',
      cardCode: 'A18',
    })

    expect(
      addMemberRequestSchema.parse({
        name: 'Jane Doe',
        type: 'General',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Prefers morning sessions',
        beginTime: '2026-03-30T00:00:00',
        endTime: '2026-07-15T23:59:59',
        cardNo: '0105451261',
        cardCode: 'A18',
      }),
    ).toEqual({
      name: 'Jane Doe',
      type: 'General',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Prefers morning sessions',
      beginTime: '2026-03-30T00:00:00',
      endTime: '2026-07-15T23:59:59',
      cardNo: '0105451261',
      cardCode: 'A18',
    })

    expect(
      provisionMemberAccessRequestSchema.parse({
        name: 'Jane Doe',
        type: 'General',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Prefers morning sessions',
        beginTime: '2026-03-30T00:00:00',
        endTime: '2026-07-15T23:59:59',
        cardNo: ' 0105451261 ',
        cardCode: ' A18 ',
      }),
    ).toEqual({
      name: 'Jane Doe',
      type: 'General',
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1212',
      remark: 'Prefers morning sessions',
      beginTime: '2026-03-30T00:00:00',
      endTime: '2026-07-15T23:59:59',
      cardNo: '0105451261',
      cardCode: 'A18',
    })
  })

  it('rejects member provisioning requests without a usable card code', () => {
    expect(() =>
      addMemberRequestSchema.parse({
        name: 'Jane Doe',
        type: 'General',
        beginTime: '2026-03-30T00:00:00',
        endTime: '2026-07-15T23:59:59',
        cardNo: '0102857149',
        cardCode: '',
      }),
    ).toThrow(/Card code is required\./)

    expect(() =>
      provisionMemberAccessRequestSchema.parse({
        name: 'Jane Doe',
        type: 'General',
        beginTime: '2026-03-30T00:00:00',
        endTime: '2026-07-15T23:59:59',
        cardNo: '0102857149',
        cardCode: '  ',
      }),
    ).toThrow(/Card code is required\./)
  })

  it('validates optional profile fields and access window datetimes for provisioning requests', () => {
    expect(() =>
      addMemberRequestSchema.parse({
        name: 'Jane Doe',
        type: 'General',
        email: 'not-an-email',
        beginTime: '2026-03-30T00:00:00',
        endTime: '2026-07-15T23:59:59',
        cardNo: '0102857149',
        cardCode: 'A18',
      }),
    ).toThrow(/Email must be valid\./)

    expect(() =>
      provisionMemberAccessRequestSchema.parse({
        name: 'Jane Doe',
        type: 'General',
        beginTime: '2026-03-30',
        endTime: '2026-07-15T23:59:59',
        cardNo: '0102857149',
        cardCode: 'A18',
      }),
    ).toThrow(/Datetime must be in YYYY-MM-DDTHH:mm:ss format\./)
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
