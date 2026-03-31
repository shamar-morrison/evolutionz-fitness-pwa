import { upsertSessionMember } from '@/lib/member-session-store'
import {
  buildMemberPreview,
  type AssignAccessSlotJobRequest,
  type ResetAccessSlotJobRequest,
} from '@/lib/member-job'
import { normalizeCardNo } from '@/lib/card-no'
import type { Member, MemberType } from '@/types'

// TODO: Replace with Supabase mutations

export type MemberCardSource = 'inventory' | 'manual'

export type AddMemberData = {
  name: string
  type: MemberType
  expiry: string
  cardSource: MemberCardSource
  cardNo: string
}

type AccessControlJobSuccessResponse = {
  ok: true
  jobId: string
  result: unknown
}

type AccessControlJobErrorResponse = {
  ok: false
  jobId?: string
  error: string
}

type ProvisionMemberSuccessResponse = {
  ok: true
  employeeNo: string
  cardNo: string
}

export type MemberProvisioningStep = 'provisioning_member'

export class MemberProvisioningError extends Error {
  step: MemberProvisioningStep
  member?: Member

  constructor({
    step,
    message,
    member,
  }: {
    step: MemberProvisioningStep
    message: string
    member?: Member
  }) {
    super(message)
    this.name = 'MemberProvisioningError'
    this.step = step
    this.member = member
  }
}

type AddMemberOptions = {
  onStepChange?: (step: MemberProvisioningStep) => void
}

type SlotJobPath = '/api/access/slots/assign' | '/api/access/slots/reset'

async function queueSlotJob(
  path: SlotJobPath,
  body: AssignAccessSlotJobRequest | ResetAccessSlotJobRequest,
) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let responseBody: AccessControlJobSuccessResponse | AccessControlJobErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | AccessControlJobSuccessResponse
      | AccessControlJobErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to process member access job.',
    )
  }

  return responseBody
}

export async function addMember(data: AddMemberData, options: AddMemberOptions = {}): Promise<Member> {
  const now = new Date()
  const normalizedCardNo = normalizeCardNo(data.cardNo)
  options.onStepChange?.('provisioning_member')

  try {
    const response = await fetch('/api/access/members/provision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        expiry: data.expiry,
        cardSource: data.cardSource,
        cardNo: normalizedCardNo,
      }),
    })

    let responseBody: ProvisionMemberSuccessResponse | AccessControlJobErrorResponse | null = null

    try {
      responseBody = (await response.json()) as
        | ProvisionMemberSuccessResponse
        | AccessControlJobErrorResponse
    } catch {
      responseBody = null
    }

    if (!response.ok || !responseBody || responseBody.ok === false) {
      throw new Error(
        responseBody && responseBody.ok === false
          ? responseBody.error
          : 'Failed to provision the selected card.',
      )
    }

    const readyMember = buildMemberPreview(data, {
      now,
      employeeNo: responseBody.employeeNo,
      deviceAccessState: 'ready',
    })

    upsertSessionMember(readyMember)

    return readyMember
  } catch (error) {
    throw new MemberProvisioningError({
      step: 'provisioning_member',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to provision the selected card.',
    })
  }
}

export async function releaseMemberSlot(member: Member): Promise<Member> {
  if (!member.slotPlaceholderName) {
    throw new Error('This member does not have a reusable Hik slot recorded.')
  }

  try {
    await queueSlotJob('/api/access/slots/reset', {
      employeeNo: member.employeeNo,
      placeholderName: member.slotPlaceholderName,
    })
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to release the Hik slot: ${error.message}`
        : 'Failed to release the Hik slot.',
    )
  }

  const releasedMember = {
    ...member,
    deviceAccessState: 'released' as const,
  }

  upsertSessionMember(releasedMember)

  return releasedMember
}

export type UpdateMemberData = Partial<{
  name: string
  cardNo: string
  type: MemberType
  expiry: string
}>

export async function updateMember(id: string, data: UpdateMemberData): Promise<Member> {
  // TODO: Replace with Supabase update
  console.log('Updating member:', id, data)
  await new Promise((resolve) => setTimeout(resolve, 500))
  
  // Return mock updated member
  return {
    id,
    employeeNo: id,
    name: data.name ?? 'Unknown',
    cardNo: data.cardNo ?? 'EF-000000',
    type: data.type ?? 'General',
    expiry: data.expiry ?? new Date().toISOString(),
    status: 'Active',
    deviceAccessState: 'ready',
    balance: 0,
    createdAt: new Date().toISOString(),
  }
}

export async function suspendMember(id: string): Promise<void> {
  // TODO: Replace with Supabase update
  console.log('Suspending member:', id)
  await new Promise((resolve) => setTimeout(resolve, 500))
}

export async function reactivateMember(id: string): Promise<void> {
  // TODO: Replace with Supabase update
  console.log('Reactivating member:', id)
  await new Promise((resolve) => setTimeout(resolve, 500))
}

export async function revokeCardAccess(id: string): Promise<void> {
  // TODO: Replace with Supabase update
  console.log('Revoking card access for member:', id)
  await new Promise((resolve) => setTimeout(resolve, 500))
}
