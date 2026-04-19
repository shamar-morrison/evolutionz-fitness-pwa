import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readCardFeeSettings, upsertCardFeeSettings } from '@/lib/card-fee-settings-server'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateCardFeeSettingsSchema = z
  .object({
    amountJmd: z.number().int().positive(),
  })
  .strict()

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const settings = await readCardFeeSettings(getSupabaseAdminClient())

    return NextResponse.json({
      ok: true,
      settings,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading card fee settings.',
      500,
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = updateCardFeeSettingsSchema.parse(requestBody)
    const settings = await upsertCardFeeSettings(getSupabaseAdminClient(), input)

    return NextResponse.json({
      ok: true,
      settings,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse('amountJmd must be a whole number greater than 0.', 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while updating card fee settings.',
      500,
    )
  }
}
