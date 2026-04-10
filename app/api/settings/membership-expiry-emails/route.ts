import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  findUnsupportedMembershipExpiryEmailTemplateTokens,
  normalizeMembershipExpiryEmailSettingsInput,
} from '@/lib/membership-expiry-email-settings'
import {
  readMembershipExpiryEmailSettings,
  upsertMembershipExpiryEmailSettings,
} from '@/lib/membership-expiry-email-settings-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateMembershipExpiryEmailSettingsSchema = z
  .object({
    enabled: z.boolean(),
    dayOffsets: z.array(z.number().int().positive()).default([]),
    subjectTemplate: z.string().trim().min(1, 'Subject template is required.'),
    bodyTemplate: z.string().trim().min(1, 'Body template is required.'),
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

function getUnsupportedTemplateErrorMessage(input: {
  subjectTemplate: string
  bodyTemplate: string
}) {
  const unsupportedTokens = [
    ...findUnsupportedMembershipExpiryEmailTemplateTokens(input.subjectTemplate),
    ...findUnsupportedMembershipExpiryEmailTemplateTokens(input.bodyTemplate),
  ]

  if (unsupportedTokens.length === 0) {
    return null
  }

  return `Unsupported template tokens: ${Array.from(new Set(unsupportedTokens)).join(', ')}.`
}

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const settings = await readMembershipExpiryEmailSettings(getSupabaseAdminClient())

    return NextResponse.json({
      ok: true,
      settings,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading membership expiry email settings.',
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
    const parsedInput = updateMembershipExpiryEmailSettingsSchema.parse(requestBody)
    const input = normalizeMembershipExpiryEmailSettingsInput(parsedInput)

    if (input.enabled && input.dayOffsets.length === 0) {
      return createErrorResponse(
        'At least one reminder day offset is required when reminders are enabled.',
        400,
      )
    }

    const unsupportedTemplateError = getUnsupportedTemplateErrorMessage(input)

    if (unsupportedTemplateError) {
      return createErrorResponse(unsupportedTemplateError, 400)
    }

    const settings = await upsertMembershipExpiryEmailSettings(getSupabaseAdminClient(), input)

    return NextResponse.json({
      ok: true,
      settings,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(
        'enabled, dayOffsets, subjectTemplate, and bodyTemplate are required.',
        400,
      )
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while updating membership expiry email settings.',
      500,
    )
  }
}
