import { z } from 'zod'
import { DEFAULT_CARD_FEE_AMOUNT_JMD } from '@/lib/business-constants'
import { cardFeeSettingsSchema, type UpdateCardFeeSettingsInput } from '@/lib/card-fee-settings'
import type { CardFeeSettings } from '@/types'

const cardFeeSettingsRowSchema = z.object({
  id: z.number().int().positive(),
  amount_jmd: z.number().int().positive(),
  created_at: z.string().trim().min(1),
  updated_at: z.string().trim().min(1),
})

export const CARD_FEE_SETTINGS_TABLE = 'card_fee_settings'
export const CARD_FEE_SETTINGS_ROW_ID = 1

type CardFeeSettingsRow = z.infer<typeof cardFeeSettingsRowSchema>

export type CardFeeSettingsAdminClient = {
  from(table: string): any
}

export function buildDefaultCardFeeSettings(): CardFeeSettings {
  return cardFeeSettingsSchema.parse({
    amountJmd: DEFAULT_CARD_FEE_AMOUNT_JMD,
  })
}

function mapCardFeeSettingsRow(row: CardFeeSettingsRow | null | undefined) {
  if (!row) {
    return buildDefaultCardFeeSettings()
  }

  return cardFeeSettingsSchema.parse({
    amountJmd: row.amount_jmd,
  })
}

async function selectSingleSettingsRow(
  query: PromiseLike<{
    data: CardFeeSettingsRow | null
    error: { message: string } | null
  }>,
  fallbackErrorPrefix: string,
) {
  const { data, error } = await query

  if (error) {
    throw new Error(`${fallbackErrorPrefix}: ${error.message}`)
  }

  return data ? cardFeeSettingsRowSchema.parse(data) : null
}

export async function readCardFeeSettings(
  supabase: CardFeeSettingsAdminClient,
) {
  const row = await selectSingleSettingsRow(
    supabase
      .from(CARD_FEE_SETTINGS_TABLE)
      .select('*')
      .eq('id', CARD_FEE_SETTINGS_ROW_ID)
      .maybeSingle(),
    'Failed to read card fee settings',
  )

  return mapCardFeeSettingsRow(row)
}

export async function upsertCardFeeSettings(
  supabase: CardFeeSettingsAdminClient,
  input: UpdateCardFeeSettingsInput,
) {
  const row = await selectSingleSettingsRow(
    supabase
      .from(CARD_FEE_SETTINGS_TABLE)
      .upsert(
        {
          id: CARD_FEE_SETTINGS_ROW_ID,
          amount_jmd: input.amountJmd,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'id',
        },
      )
      .select('*')
      .maybeSingle(),
    'Failed to update card fee settings',
  )

  return mapCardFeeSettingsRow(row)
}
