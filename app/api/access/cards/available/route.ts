import { NextResponse } from 'next/server'
import { createAndWaitForAccessControlJob } from '@/lib/access-control-jobs'
import {
  normalizeAvailableAccessCards,
  normalizeSyncedAvailableAccessCards,
} from '@/lib/available-cards'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { AvailableAccessCard, CardStatus } from '@/types'

const MAX_WAIT_MS = 180_000
const SYNC_TIMEOUT_ERROR = 'Sync cards request timed out after 180 seconds.'

type ExistingCardRow = {
  card_no: string | null
  card_code: string | null
  status: CardStatus | null
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

async function persistSyncedAvailableCards(cards: AvailableAccessCard[]) {
  if (cards.length === 0) {
    return
  }

  const supabase = getSupabaseAdminClient()
  const cardNos = cards.map((card) => card.cardNo)
  const { data: existingCards, error: existingCardsError } = await supabase
    .from('cards')
    .select('card_no, card_code, status')
    .in('card_no', cardNos)

  if (existingCardsError) {
    throw new Error(`Failed to read existing cards: ${existingCardsError.message}`)
  }

  const existingCardsByNumber = new Map(
    ((existingCards ?? []) as ExistingCardRow[]).map((card) => [
      normalizeText(card.card_no),
      {
        cardCode: normalizeText(card.card_code) || null,
        status: card.status,
      },
    ]),
  )

  const missingRows = cards
    .filter((card) => !existingCardsByNumber.has(card.cardNo))
    .map((card) => ({
      card_no: card.cardNo,
      card_code: card.cardCode,
      status: 'available' as const,
      employee_no: null,
    }))

  if (missingRows.length > 0) {
    const { error } = await supabase.from('cards').insert(missingRows)

    if (error) {
      throw new Error(`Failed to insert synced cards: ${error.message}`)
    }
  }

  for (const card of cards) {
    const existingCard = existingCardsByNumber.get(card.cardNo)

    if (!existingCard || existingCard.status !== 'available') {
      continue
    }

    const updateValues: {
      status: 'available'
      employee_no: null
      card_code?: string
    } = {
      status: 'available',
      employee_no: null,
    }

    if (card.cardCode) {
      updateValues.card_code = card.cardCode
    }

    const { error } = await supabase
      .from('cards')
      .update(updateValues)
      .eq('card_no', card.cardNo)
      .eq('status', 'available')

    if (error) {
      throw new Error(`Failed to update synced card ${card.cardNo}: ${error.message}`)
    }
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('cards')
      .select('card_no, card_code')
      .eq('status', 'available')
      .order('card_no', { ascending: true })

    if (error) {
      throw new Error(`Failed to read available cards: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      cards: normalizeAvailableAccessCards({
        cards: (data ?? []).map((row) => ({
          cardNo: typeof row.card_no === 'string' ? row.card_no : '',
          cardCode: typeof row.card_code === 'string' ? row.card_code : null,
        })),
      }),
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unexpected server error while fetching available cards.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}

export async function POST() {
  try {
    const job = await createAndWaitForAccessControlJob({
      jobType: 'sync_available_cards',
      payload: {},
      messages: {
        createErrorPrefix: 'Failed to create sync available cards job',
        missingJobIdMessage: 'Failed to create sync available cards job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read sync available cards job ${jobId}`,
        missingJobMessage: (jobId) =>
          `Sync available cards job ${jobId} was not found after creation.`,
        failedJobMessage: 'Sync available cards job failed.',
        timeoutMessage: SYNC_TIMEOUT_ERROR,
      },
      maxWaitMs: MAX_WAIT_MS,
    })

    if (job.status === 'done') {
      const syncedCards = normalizeSyncedAvailableAccessCards(job.result)

      await persistSyncedAvailableCards(syncedCards)

      return NextResponse.json({
        ok: true,
        syncedCards: syncedCards.length,
      })
    }

    return NextResponse.json(
      {
        ok: false,
        jobId: job.jobId,
        error: job.error,
      },
      { status: job.httpStatus },
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error while syncing cards.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
