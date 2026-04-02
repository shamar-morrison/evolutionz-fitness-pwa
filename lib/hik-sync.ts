import { z } from 'zod'
import type { MemberSyncSummary } from '@/types'

const memberSyncSummarySchema = z.object({
  membersAdded: z.number().int().nonnegative(),
  membersUpdated: z.number().int().nonnegative(),
})

type SyncMembersSuccessResponse = {
  ok: true
  summary: MemberSyncSummary
}

type SyncMembersErrorResponse = {
  ok: false
  error: string
}

export function normalizeMemberSyncSummary(input: unknown): MemberSyncSummary {
  const parsed = memberSyncSummarySchema.safeParse(input)

  if (!parsed.success) {
    throw new Error('Bridge returned an unexpected sync summary.')
  }

  return parsed.data
}

export async function syncMembersFromDevice(): Promise<MemberSyncSummary> {
  const response = await fetch('/api/hik/sync-members', {
    method: 'POST',
    cache: 'no-store',
  })

  let responseBody: SyncMembersSuccessResponse | SyncMembersErrorResponse | null = null

  try {
    responseBody = (await response.json()) as SyncMembersSuccessResponse | SyncMembersErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to sync members from the device.',
    )
  }

  return normalizeMemberSyncSummary(responseBody.summary)
}
