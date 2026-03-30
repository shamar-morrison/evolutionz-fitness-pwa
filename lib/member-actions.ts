import { upsertSessionMember } from '@/lib/member-session-store'
import {
  buildAddCardPayload,
  buildMemberPreview,
  generateEmployeeNo,
  type AddMemberCardJobRequest,
  type AddMemberUserJobRequest,
} from '@/lib/member-job'
import type { Member, MemberType } from '@/types'

// TODO: Replace with Supabase mutations

export type AddMemberData = {
  name: string
  cardNo: string
  type: MemberType
  expiry: string
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

export type MemberProvisioningStep = 'creating_member' | 'issuing_card'

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

async function queueMemberJob(
  path: '/api/access/members/user' | '/api/access/members/card',
  body: AddMemberUserJobRequest | AddMemberCardJobRequest,
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
  const employeeNo = generateEmployeeNo(now)
  const readyMember = buildMemberPreview(data, {
    now,
    employeeNo,
    deviceAccessState: 'ready',
  })

  options.onStepChange?.('creating_member')

  try {
    await queueMemberJob('/api/access/members/user', {
      employeeNo,
      name: data.name,
      expiry: data.expiry,
    })
  } catch (error) {
    throw new MemberProvisioningError({
      step: 'creating_member',
      message:
        error instanceof Error
          ? `Failed to create member on the device: ${error.message}`
          : 'Failed to create member on the device.',
    })
  }

  options.onStepChange?.('issuing_card')

  try {
    await queueMemberJob('/api/access/members/card', buildAddCardPayload({
      employeeNo,
      cardNo: data.cardNo,
    }))
  } catch (error) {
    const pendingMember = {
      ...readyMember,
      deviceAccessState: 'card_pending' as const,
    }

    upsertSessionMember(pendingMember)

    throw new MemberProvisioningError({
      step: 'issuing_card',
      member: pendingMember,
      message:
        error instanceof Error
          ? `Member was created on the device, but card issuance failed: ${error.message}`
          : 'Member was created on the device, but card issuance failed.',
    })
  }

  upsertSessionMember(readyMember)

  return readyMember
}

export async function retryMemberCard(member: Member): Promise<Member> {
  try {
    await queueMemberJob('/api/access/members/card', buildAddCardPayload({
      employeeNo: member.id,
      cardNo: member.cardNo,
    }))
  } catch (error) {
    throw new MemberProvisioningError({
      step: 'issuing_card',
      member,
      message:
        error instanceof Error
          ? `Card issuance retry failed: ${error.message}`
          : 'Card issuance retry failed.',
    })
  }

  const readyMember = {
    ...member,
    deviceAccessState: 'ready' as const,
  }

  upsertSessionMember(readyMember)

  return readyMember
}

export type UpdateMemberData = Partial<AddMemberData>

export async function updateMember(id: string, data: UpdateMemberData): Promise<Member> {
  // TODO: Replace with Supabase update
  console.log('Updating member:', id, data)
  await new Promise((resolve) => setTimeout(resolve, 500))
  
  // Return mock updated member
  return {
    id,
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
