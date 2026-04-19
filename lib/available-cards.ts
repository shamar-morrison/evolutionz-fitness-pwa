import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import type { AvailableAccessCard } from '@/types'

const availableAccessCardSchema = z.object({
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  cardCode: z.string().trim().min(1).nullable(),
})
const syncedAvailableAccessCardSchema = z.object({
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  card_code: z.string().trim().min(1).nullable(),
})

const availableCardsResponseSchema = z.object({
  cards: z.array(availableAccessCardSchema).default([]),
})
const syncAvailableCardsResponseSchema = z.object({
  syncedCards: z.number().int().nonnegative(),
})

const createManualAccessCardResponseSchema = z.object({
  card: availableAccessCardSchema,
})

function compareCards(left: AvailableAccessCard, right: AvailableAccessCard) {
  return left.cardNo.localeCompare(right.cardNo)
}

export function normalizeAvailableAccessCards(input: unknown): AvailableAccessCard[] {
  const parsed = availableCardsResponseSchema.safeParse(input)

  if (!parsed.success) {
    return []
  }

  const cardsByNumber = new Map<string, AvailableAccessCard>()

  for (const card of parsed.data.cards) {
    const cardNo = card.cardNo.trim()
    const cardCode = typeof card.cardCode === 'string' ? card.cardCode.trim() : null

    if (!cardNo) {
      continue
    }

    const existingCard = cardsByNumber.get(cardNo)

    if (!existingCard || (!existingCard.cardCode && cardCode)) {
      cardsByNumber.set(cardNo, {
        cardNo,
        cardCode,
      })
    }
  }

  return Array.from(cardsByNumber.values()).sort(compareCards)
}

export function normalizeSyncedAvailableAccessCards(input: unknown): AvailableAccessCard[] {
  const parsed = z.array(syncedAvailableAccessCardSchema).safeParse(input)

  if (!parsed.success) {
    throw new Error('Bridge returned an unexpected available card sync result.')
  }

  return normalizeAvailableAccessCards({
    cards: parsed.data.map((card) => ({
      cardNo: card.cardNo,
      cardCode: card.card_code,
    })),
  })
}

export function normalizeSyncedAvailableCardsCount(input: unknown) {
  const parsed = syncAvailableCardsResponseSchema.safeParse(input)

  if (!parsed.success) {
    throw new Error('Available card sync returned an unexpected response.')
  }

  return parsed.data.syncedCards
}

export function formatAvailableAccessCardLabel(card: AvailableAccessCard) {
  return card.cardCode ? `${card.cardCode} — ${card.cardNo}` : card.cardNo
}

export async function fetchAvailableAccessCards(): Promise<AvailableAccessCard[]> {
  const responseBody = await apiFetch(
    '/api/access/cards/available',
    {
      method: 'GET',
      cache: 'no-store',
    },
    availableCardsResponseSchema,
    'Failed to load available cards.',
  )

  return normalizeAvailableAccessCards({ cards: responseBody.cards })
}

export async function createManualAccessCard(input: {
  cardNo: string
  cardCode: string
}): Promise<AvailableAccessCard> {
  const responseBody = await apiFetch(
    '/api/cards/manual',
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
    createManualAccessCardResponseSchema,
    'Failed to create the access card.',
  )

  return normalizeAvailableAccessCards({ cards: [responseBody.card] })[0] ?? responseBody.card
}

export async function syncAvailableAccessCards(): Promise<number> {
  const responseBody = await apiFetch(
    '/api/access/cards/available',
    {
      method: 'POST',
      cache: 'no-store',
    },
    syncAvailableCardsResponseSchema,
    'Failed to sync available cards.',
  )

  return normalizeSyncedAvailableCardsCount(responseBody)
}
