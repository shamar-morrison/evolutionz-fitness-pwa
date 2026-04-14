import { describe, expect, it } from 'vitest'
import {
  buildMemberPaymentReceipt,
  buildMemberPaymentReceiptEmailBody,
  formatReceiptDateValue,
  formatReceiptTimestampValue,
} from '@/lib/member-payment-receipts'

function createReceipt(overrides: Partial<Parameters<typeof buildMemberPaymentReceipt>[0]> = {}) {
  return buildMemberPaymentReceipt({
    paymentId: 'payment-1',
    receiptNumber: 'EF-2026-00001',
    receiptSentAt: null,
    memberName: 'Jane Doe',
    recipientEmail: 'jane@example.com',
    paymentDate: '2026-04-12',
    membershipBeginTime: '2026-04-01T00:00:00.000Z',
    membershipEndTime: '2026-04-30T23:59:59.000Z',
    paymentType: 'membership',
    memberTypeName: 'General',
    amountPaid: 12000,
    paymentMethod: 'cash',
    recordedByName: 'Jordan Staff',
    notes: 'April renewal',
    ...overrides,
  })
}

describe('member payment receipt email body', () => {
  it('formats receipt dates without a time component', () => {
    expect(formatReceiptDateValue('2026-04-12')).toBe('12 April 2026')
  })

  it('formats receipt timestamps with Jamaica time', () => {
    expect(formatReceiptTimestampValue('2026-04-12T12:05:00.000Z')).toBe(
      '12 April 2026 at 7:05 am',
    )
  })

  it('renders membership start and end rows for membership receipts', () => {
    const receipt = createReceipt()
    const body = buildMemberPaymentReceiptEmailBody(receipt)

    expect(body).toContain('Membership Start')
    expect(body).toContain('Membership End')
    expect(body).toContain('31 March 2026 at 7:00 pm')
    expect(body).toContain('30 April 2026 at 6:59 pm')
  })

  it('omits membership start and end rows for card fee receipts', () => {
    const receipt = createReceipt({
      paymentType: 'card_fee',
      memberTypeName: null,
      membershipBeginTime: null,
      membershipEndTime: null,
      amountPaid: 2500,
      notes: 'Replacement card',
    })
    const body = buildMemberPaymentReceiptEmailBody(receipt)

    expect(body).not.toContain('Membership Start')
    expect(body).not.toContain('Membership End')
  })
})
