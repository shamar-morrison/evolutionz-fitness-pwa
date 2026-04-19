import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import { formatJmdCurrency } from '@/lib/pt-scheduling'
import type { CardFeeSettings } from '@/types'

export const cardFeeSettingsSchema = z.object({
  amountJmd: z.number().int().positive(),
})

const cardFeeSettingsResponseSchema = z.object({
  settings: cardFeeSettingsSchema,
})

export type UpdateCardFeeSettingsInput = {
  amountJmd: number
}

export function formatCardFeeAmount(amountJmd: number) {
  return `JMD ${formatJmdCurrency(amountJmd)}`
}

export async function fetchCardFeeSettings(): Promise<CardFeeSettings> {
  const responseBody = await apiFetch(
    '/api/settings/card-fee',
    {
      method: 'GET',
      cache: 'no-store',
    },
    cardFeeSettingsResponseSchema,
    'Failed to load card fee settings.',
  )

  return responseBody.settings
}

export async function updateCardFeeSettings(
  input: UpdateCardFeeSettingsInput,
): Promise<CardFeeSettings> {
  const responseBody = await apiFetch(
    '/api/settings/card-fee',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
    cardFeeSettingsResponseSchema,
    'Failed to update the card fee settings.',
  )

  return responseBody.settings
}
