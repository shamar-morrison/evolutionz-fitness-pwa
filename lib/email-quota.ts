import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'

export const emailQuotaSchema = z.object({
  sent: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
})

export type EmailQuota = z.infer<typeof emailQuotaSchema>

export async function fetchEmailQuota(): Promise<EmailQuota> {
  return apiFetch(
    '/api/email/quota',
    {
      method: 'GET',
    },
    emailQuotaSchema,
    'Failed to load email quota.',
  )
}
