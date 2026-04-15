import { z } from 'zod'
import { formatJmdCurrency } from '@/lib/pt-scheduling'
import type { CardFeeSettings } from '@/types'

export const cardFeeSettingsSchema = z.object({
  amountJmd: z.number().int().positive(),
})

const cardFeeSettingsResponseSchema = z.object({
  settings: cardFeeSettingsSchema,
})

type CardFeeSettingsSuccessResponse = {
  ok: true
  settings: CardFeeSettings
}

type ErrorResponse = {
  ok?: false
  error: string
}

export type UpdateCardFeeSettingsInput = {
  amountJmd: number
}

export function formatCardFeeAmount(amountJmd: number) {
  return `JMD ${formatJmdCurrency(amountJmd)}`
}

function getResponseErrorMessage(responseBody: unknown, fallback: string) {
  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
  ) {
    return responseBody.error
  }

  return fallback
}

export async function fetchCardFeeSettings(): Promise<CardFeeSettings> {
  const response = await fetch('/api/settings/card-fee', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: CardFeeSettingsSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as CardFeeSettingsSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getResponseErrorMessage(responseBody, 'Failed to load card fee settings.'))
  }

  return cardFeeSettingsResponseSchema.parse(responseBody).settings
}

export async function updateCardFeeSettings(
  input: UpdateCardFeeSettingsInput,
): Promise<CardFeeSettings> {
  const response = await fetch('/api/settings/card-fee', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  let responseBody: CardFeeSettingsSuccessResponse | ErrorResponse | null = null

  try {
    responseBody = (await response.json()) as CardFeeSettingsSuccessResponse | ErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(getResponseErrorMessage(responseBody, 'Failed to update the card fee settings.'))
  }

  return cardFeeSettingsResponseSchema.parse(responseBody).settings
}
