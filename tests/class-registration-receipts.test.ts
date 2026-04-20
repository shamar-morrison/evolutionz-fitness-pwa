import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatClassRegistrationReceiptDateValue,
  sendClassRegistrationReceipt,
} from '@/lib/class-registration-receipts'

describe('class registration receipts helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('formats date-only payment dates without shifting the Jamaica calendar day', () => {
    expect(formatClassRegistrationReceiptDateValue('2026-04-12')).toBe('12 April 2026')
  })

  it('returns the in-progress send response payload on a 409 conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          sendInProgress: true,
          error: 'A receipt send is already in progress for this registration.',
          receiptSentAt: null,
        }),
        {
          status: 409,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendClassRegistrationReceipt('registration-1')).resolves.toEqual({
      ok: false,
      sendInProgress: true,
      error: 'A receipt send is already in progress for this registration.',
      receiptSentAt: null,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/classes/registrations/registration-1/receipt/send', {
      method: 'POST',
    })
  })
})
