import { normalizeMember } from '@/lib/members'
import { hasAssignedCard } from '@/lib/member-card'
import { upsertSessionMemberOverride } from '@/lib/member-session-store'
import {
  type AssignAccessSlotJobRequest,
  type ResetAccessSlotJobRequest,
} from '@/lib/member-job'
import { normalizeCardNo } from '@/lib/card-no'
import type { Member, MemberGender, MemberType } from '@/types'

// TODO: Replace with Supabase mutations

export type AddMemberData = {
  name: string
  type: MemberType
  gender?: MemberGender
  email?: string
  phone?: string
  remark?: string
  beginTime: string
  endTime: string
  cardNo: string
  cardCode: string
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
  member: Member
}

type MemberMutationSuccessResponse = {
  ok: true
  member: Member
  warning?: string
}

type DeleteMemberSuccessResponse = {
  ok: true
  warning?: string
}

export type AssignMemberCardData = {
  cardNo: string
  beginTime: string
  endTime: string
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
type MemberMutationPath =
  | `/api/access/members/${string}/assign-card`
  | `/api/access/members/${string}/suspend`
  | `/api/access/members/${string}/unassign-card`
  | `/api/access/members/${string}/report-card-lost`
  | `/api/access/members/${string}/recover-card`
  | `/api/members/${string}/photo`
  | `/api/members/${string}/edit`
  | `/api/members/${string}`

async function parseMemberMutationResponse(
  response: Response,
  errorMessage: string,
) {
  let responseBody: MemberMutationSuccessResponse | AccessControlJobErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | MemberMutationSuccessResponse
      | AccessControlJobErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false ? responseBody.error : errorMessage,
    )
  }

  const member = normalizeMember({ member: responseBody.member })

  if (!member) {
    throw new Error('Failed to read the updated member response.')
  }

  return {
    member,
    warning: responseBody.warning,
  }
}

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

async function requestMemberMutation(
  path: MemberMutationPath,
  {
    method,
    body,
    errorMessage,
  }: {
    method: 'POST' | 'PATCH' | 'DELETE'
    body?: Record<string, unknown>
    errorMessage: string
  },
) {
  const response = await fetch(path, {
    method,
    ...(body
      ? {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      : {}),
  })

  return parseMemberMutationResponse(response, errorMessage)
}

async function requestDeleteMember(
  path: `/api/members/${string}`,
  errorMessage: string,
) {
  const response = await fetch(path, {
    method: 'DELETE',
  })

  let responseBody: DeleteMemberSuccessResponse | AccessControlJobErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | DeleteMemberSuccessResponse
      | AccessControlJobErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false ? responseBody.error : errorMessage,
    )
  }

  return {
    warning: typeof responseBody.warning === 'string' ? responseBody.warning : undefined,
  }
}

export async function assignMemberCard(
  memberId: string,
  data: AssignMemberCardData,
): Promise<Member> {
  const normalizedCardNo = normalizeCardNo(data.cardNo)
  const response = await requestMemberMutation(
    `/api/access/members/${encodeURIComponent(memberId)}/assign-card`,
    {
      method: 'POST',
      body: {
        cardNo: normalizedCardNo,
        beginTime: data.beginTime,
        endTime: data.endTime,
      },
      errorMessage: 'Failed to assign the member card.',
    },
  )

  return response.member
}

export async function addMember(data: AddMemberData, options: AddMemberOptions = {}): Promise<Member> {
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
        type: data.type,
        ...(data.gender ? { gender: data.gender } : {}),
        ...(data.email ? { email: data.email } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.remark ? { remark: data.remark } : {}),
        beginTime: data.beginTime,
        endTime: data.endTime,
        cardNo: normalizedCardNo,
        cardCode: data.cardCode,
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

    const member = normalizeMember({ member: responseBody.member })

    if (!member) {
      throw new Error('Failed to read the provisioned member response.')
    }

    return member
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

  upsertSessionMemberOverride(releasedMember)

  return releasedMember
}

export type UpdateMemberData = {
  name: string
  type: MemberType
  gender?: MemberGender | null
  email?: string | null
  phone?: string | null
  remark?: string | null
  beginTime: string
  endTime: string
}

export type UpdateMemberResult = {
  member: Member
  warning?: string
}

export async function updateMember(
  id: string,
  data: UpdateMemberData,
): Promise<UpdateMemberResult> {
  return requestMemberMutation(`/api/members/${encodeURIComponent(id)}/edit`, {
    method: 'PATCH',
    body: {
      name: data.name,
      type: data.type,
      gender: data.gender ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      remark: data.remark ?? null,
      beginTime: data.beginTime,
      endTime: data.endTime,
    },
    errorMessage: 'Failed to update member.',
  })
}

export async function uploadMemberPhoto(
  id: string,
  photo: Blob,
): Promise<Member> {
  const formData = new FormData()

  formData.append('photo', photo, `${id}.jpg`)

  const response = await fetch(`/api/members/${encodeURIComponent(id)}/photo`, {
    method: 'POST',
    body: formData,
  })

  const result = await parseMemberMutationResponse(response, 'Failed to upload member photo.')

  return result.member
}

export async function deleteMemberPhoto(id: string): Promise<Member> {
  const response = await requestMemberMutation(`/api/members/${encodeURIComponent(id)}/photo`, {
    method: 'DELETE',
    errorMessage: 'Failed to delete member photo.',
  })

  return response.member
}

export async function deleteMember(
  id: string,
): Promise<{ warning?: string }> {
  return requestDeleteMember(
    `/api/members/${encodeURIComponent(id)}`,
    'Failed to delete member.',
  )
}

export async function suspendMember(
  member: Pick<Member, 'id' | 'employeeNo' | 'cardNo'>,
): Promise<Member> {
  const response = await requestMemberMutation(
    `/api/access/members/${encodeURIComponent(member.id)}/suspend`,
    {
      method: 'POST',
      body: {
        employeeNo: member.employeeNo,
        cardNo: hasAssignedCard(member.cardNo) ? member.cardNo : null,
      },
      errorMessage: 'Failed to suspend member.',
    },
  )

  return response.member
}

export async function reactivateMember(id: string): Promise<Member> {
  const response = await requestMemberMutation(`/api/members/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: {
      status: 'Active',
    },
    errorMessage: 'Failed to reactivate member.',
  })

  return response.member
}

export async function unassignMemberCard(
  member: Pick<Member, 'id' | 'employeeNo' | 'cardNo'>,
): Promise<Member> {
  if (!hasAssignedCard(member.cardNo)) {
    throw new Error('No card assigned.')
  }

  const response = await requestMemberMutation(
    `/api/access/members/${encodeURIComponent(member.id)}/unassign-card`,
    {
      method: 'POST',
      body: {
        employeeNo: member.employeeNo,
        cardNo: member.cardNo,
      },
      errorMessage: 'Failed to unassign the member card.',
    },
  )

  return response.member
}

export async function reportMemberCardLost(
  member: Pick<Member, 'id' | 'employeeNo' | 'cardNo'>,
): Promise<Member> {
  if (!hasAssignedCard(member.cardNo)) {
    throw new Error('No card assigned.')
  }

  const response = await requestMemberMutation(
    `/api/access/members/${encodeURIComponent(member.id)}/report-card-lost`,
    {
      method: 'POST',
      body: {
        employeeNo: member.employeeNo,
        cardNo: member.cardNo,
      },
      errorMessage: 'Failed to report the member card as lost.',
    },
  )

  return response.member
}

export async function recoverMemberCard(
  member: Pick<Member, 'id' | 'employeeNo' | 'cardNo'>,
): Promise<Member> {
  if (!hasAssignedCard(member.cardNo)) {
    throw new Error('No card assigned.')
  }

  const response = await requestMemberMutation(
    `/api/access/members/${encodeURIComponent(member.id)}/recover-card`,
    {
      method: 'POST',
      body: {
        employeeNo: member.employeeNo,
        cardNo: member.cardNo,
      },
      errorMessage: 'Failed to recover the member card.',
    },
  )

  return response.member
}

export async function revokeCardAccess(id: string): Promise<void> {
  console.log('Revoking card access for member:', id)
  await new Promise((resolve) => setTimeout(resolve, 500))
}
