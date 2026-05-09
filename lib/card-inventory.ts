import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import type { AvailableAccessCard, CardInventoryItem } from '@/types'

const cardInventoryItemSchema = z.object({
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  cardCode: z.string().trim().min(1).nullable(),
  createdAt: z.string().trim().min(1, 'Created timestamp is required.'),
})

const cardInventoryResponseSchema = z.object({
  cards: z.array(cardInventoryItemSchema).default([]),
})

const createCardResponseSchema = z.object({
  card: z.object({
    cardNo: z.string().trim().min(1, 'Card number is required.'),
    cardCode: z.string().trim().min(1).nullable(),
  }),
})

const decommissionCardResponseSchema = z.object({
  ok: z.literal(true),
})

export async function fetchCardInventory(): Promise<CardInventoryItem[]> {
  const responseBody = await apiFetch(
    '/api/cards',
    {
      method: 'GET',
      cache: 'no-store',
    },
    cardInventoryResponseSchema,
    'Failed to load cards.',
  )

  return responseBody.cards
}

export async function createInventoryCard(input: {
  cardNo: string
  cardCode: string
}): Promise<AvailableAccessCard> {
  const responseBody = await apiFetch(
    '/api/cards',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card_no: input.cardNo.trim(),
        card_code: input.cardCode.trim(),
      }),
    },
    createCardResponseSchema,
    'Failed to create the access card.',
  )

  return responseBody.card
}

export async function decommissionInventoryCard(cardNo: string): Promise<void> {
  await apiFetch(
    `/api/cards/${encodeURIComponent(cardNo.trim())}/decommission`,
    {
      method: 'PATCH',
    },
    decommissionCardResponseSchema,
    'Failed to decommission the access card.',
  )
}
