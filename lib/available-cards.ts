import { z } from 'zod'
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

type AvailableCardsSuccessResponse = {
  ok: true
  cards: AvailableAccessCard[]
}

type AvailableCardsErrorResponse = {
  ok: false
  error: string
}

type SyncAvailableCardsSuccessResponse = {
  ok: true
  syncedCards: number
}

type SyncAvailableCardsErrorResponse = {
  ok: false
  error: string
}

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
  const response = await fetch('/api/access/cards/available', {
    method: 'GET',
    cache: 'no-store',
  })

  let responseBody: AvailableCardsSuccessResponse | AvailableCardsErrorResponse | null = null

  try {
    responseBody = (await response.json()) as AvailableCardsSuccessResponse | AvailableCardsErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to load available cards.',
    )
  }

  return normalizeAvailableAccessCards({ cards: responseBody.cards })
}

export async function syncAvailableAccessCards(): Promise<number> {
  const response = await fetch('/api/access/cards/available', {
    method: 'POST',
    cache: 'no-store',
  })

  let responseBody: SyncAvailableCardsSuccessResponse | SyncAvailableCardsErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | SyncAvailableCardsSuccessResponse
      | SyncAvailableCardsErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to sync available cards.',
    )
  }

  return normalizeSyncedAvailableCardsCount(responseBody)
}
