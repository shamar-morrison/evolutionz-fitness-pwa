import { describe, expect, it } from 'vitest'
import {
  buildMemberPaymentReceipt,
  buildMemberPaymentReceiptEmailBody,
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
  it('renders membership start and end rows for membership receipts', () => {
    const receipt = createReceipt()
    const body = buildMemberPaymentReceiptEmailBody(receipt)

    expect(body).toContain('Membership Start')
    expect(body).toContain('Membership End')
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
