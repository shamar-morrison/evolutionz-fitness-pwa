import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dedupeRecipientsById, emailRecipientWithIdSchema } from '@/lib/admin-email'
import { getJamaicaExpiringWindow } from '@/lib/member-access-time'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const recipientFiltersSchema = z.object({
  activeMembers: z.enum(['true', 'false']).default('false'),
  expiringMembers: z.enum(['true', 'false']).default('false'),
  memberTypeIds: z.string().default(''),
  individualIds: z.string().default(''),
})

const uuidListItemSchema = z.string().uuid('Recipient filters must use valid IDs.')

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function parseUuidList(value: string) {
  if (!value.trim()) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => uuidListItemSchema.parse(item))
}

function normalizeRecipientRows(rows: Array<{ id: string; name: string; email: string | null }>) {
  const normalizedRecipients = rows.flatMap((row) => {
    const parsed = emailRecipientWithIdSchema.safeParse({
      id: row.id,
      name: row.name,
      email: row.email,
    })

    return parsed.success ? [parsed.data] : []
  })

  return dedupeRecipientsById(normalizedRecipients)
}

async function executeRecipientQuery(
  query: PromiseLike<{
    data: Array<{ id: string; name: string; email: string | null }> | null
    error: { message: string } | null
  }>,
) {
  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read email recipients: ${error.message}`)
  }

  return normalizeRecipientRows(data ?? [])
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const parsedFilters = recipientFiltersSchema.parse({
      activeMembers: searchParams.get('activeMembers') ?? 'false',
      expiringMembers: searchParams.get('expiringMembers') ?? 'false',
      memberTypeIds: searchParams.get('memberTypeIds') ?? '',
      individualIds: searchParams.get('individualIds') ?? '',
    })
    const memberTypeIds = parseUuidList(parsedFilters.memberTypeIds)
    const individualIds = parseUuidList(parsedFilters.individualIds)
    const recipientsById = new Map<string, z.infer<typeof emailRecipientWithIdSchema>>()
    const supabase = getSupabaseAdminClient() as any

    const addRecipients = (recipients: z.infer<typeof emailRecipientWithIdSchema>[]) => {
      for (const recipient of recipients) {
        if (!recipientsById.has(recipient.id)) {
          recipientsById.set(recipient.id, recipient)
        }
      }
    }

    if (parsedFilters.activeMembers === 'true') {
      addRecipients(
        await executeRecipientQuery(
          supabase.from('members').select('id, name, email').eq('status', 'Active').order('name', {
            ascending: true,
          }),
        ),
      )
    }

    if (parsedFilters.expiringMembers === 'true') {
      const { startInclusive, endExclusive } = getJamaicaExpiringWindow(new Date())
      addRecipients(
        await executeRecipientQuery(
          supabase
            .from('members')
            .select('id, name, email')
            .eq('status', 'Active')
            .gte('end_time', startInclusive)
            .lt('end_time', endExclusive)
            .order('end_time', { ascending: true }),
        ),
      )
    }

    if (memberTypeIds.length > 0) {
      addRecipients(
        await executeRecipientQuery(
          supabase
            .from('members')
            .select('id, name, email')
            .eq('status', 'Active')
            .in('member_type_id', memberTypeIds)
            .order('name', { ascending: true }),
        ),
      )
    }

    if (individualIds.length > 0) {
      addRecipients(
        await executeRecipientQuery(
          supabase.from('members').select('id, name, email').in('id', individualIds).order('name', {
            ascending: true,
          }),
        ),
      )
    }

    return NextResponse.json({
      ok: true,
      recipients: Array.from(recipientsById.values()),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading email recipients.',
      500,
    )
  }
}
