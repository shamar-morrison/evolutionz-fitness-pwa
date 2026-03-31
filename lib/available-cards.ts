import { z } from 'zod'
import type { AvailableAccessCard } from '@/types'

const availableAccessCardSchema = z.object({
  cardNo: z.string().trim().min(1, 'Card number is required.'),
})

const availableCardsResponseSchema = z.object({
  cards: z.array(availableAccessCardSchema).default([]),
})

type AvailableCardsSuccessResponse = {
  ok: true
  cards: AvailableAccessCard[]
}

type AvailableCardsErrorResponse = {
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

    if (!cardNo) {
      continue
    }

    cardsByNumber.set(cardNo, { cardNo })
  }

  return Array.from(cardsByNumber.values()).sort(compareCards)
}

export function formatAvailableAccessCardLabel(card: AvailableAccessCard) {
  return card.cardNo
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
