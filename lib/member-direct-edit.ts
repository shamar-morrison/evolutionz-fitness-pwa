import { z } from 'zod'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
} from '@/lib/access-control-jobs'
import {
  buildAddUserPayloadWithAccessWindow,
} from '@/lib/member-job'
import {
  getAccessDateTimeValue,
  parseDateInputValue,
  parseLocalDateTime,
} from '@/lib/member-access-time'
import { buildHikMemberName } from '@/lib/member-name'
import {
  mapMemberRecordToMemberWithCardCode,
  MEMBER_RECORD_SELECT,
  readMemberWithCardCode,
  type MembersReadClient,
} from '@/lib/members'
import { resolveMemberStatusForAccessWindowUpdate } from '@/lib/member-status'
import { buildMemberTypeUpdateValues } from '@/lib/member-type-sync'
import type { Member, MemberGender, MemberRecord } from '@/types'

export const UPDATE_MEMBER_WARNING = 'Member updated but device sync failed. Please try again.'
const UPDATE_MEMBER_TIMEOUT_ERROR = 'Member update request timed out after 10 seconds.'
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const joinedDateSchema = z
  .string()
  .trim()
  .regex(DATE_INPUT_PATTERN, 'Join date must be valid.')
  .refine((value) => Boolean(parseDateInputValue(value)), 'Join date must be valid.')

export const directMemberEditSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.'),
    member_type_id: z.string().trim().uuid().nullable().optional(),
    gender: z.enum(['Male', 'Female']).nullable().optional(),
    email: z.string().trim().email('Email must be valid.').nullable().optional(),
    phone: z.string().trim().min(1).nullable().optional(),
    remark: z.string().trim().min(1).nullable().optional(),
    joined_at: joinedDateSchema.nullable().optional(),
    beginTime: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Begin time must be valid.'),
    endTime: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'End time must be valid.'),
  })
  .strict()

export type DirectMemberEditInput = z.infer<typeof directMemberEditSchema>

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type DirectMemberUpdateValues = {
  name: string
  member_type_id?: string | null
  type?: Member['type']
  gender: MemberGender | null
  email: string | null
  phone: string | null
  remark: string | null
  joined_at?: string | null
  begin_time: string
  end_time: string
  status?: Member['status']
}

export type DirectMemberEditClient = MembersReadClient &
  AccessControlJobsClient & {
    from(table: 'members'): {
      update(values: DirectMemberUpdateValues): {
        eq(column: 'id', value: string): {
          select(columns: typeof MEMBER_RECORD_SELECT): {
            maybeSingle(): QueryResult<MemberRecord>
          }
        }
      }
    }
    from(table: string): unknown
  }

export type DirectMemberEditResult =
  | {
      ok: true
      member: Member
      warning?: string
    }
  | {
      ok: false
      error: string
      status: number
    }

const DIRECT_EDIT_KEYS = [
  'name',
  'gender',
  'email',
  'phone',
  'remark',
  'joined_at',
  'beginTime',
  'endTime',
] as const

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

function validateAccessWindow(beginTime: string, endTime: string) {
  const parsedBeginTime = parseLocalDateTime(beginTime)

  if (!parsedBeginTime) {
    return 'Begin time must be a valid YYYY-MM-DDTHH:mm:ss datetime.'
  }

  const parsedEndTime = parseLocalDateTime(endTime)

  if (!parsedEndTime) {
    return 'End time must be a valid YYYY-MM-DDTHH:mm:ss datetime.'
  }

  if (parsedEndTime.getTime() <= parsedBeginTime.getTime()) {
    return 'End time must be after begin time.'
  }

  return null
}

function buildCardLookupFromMember(
  member: Awaited<ReturnType<typeof readMemberWithCardCode>>,
) {
  if (!member?.cardNo || !member.cardStatus) {
    return new Map<
      string,
      {
        cardCode: string | null
        status: 'available' | 'assigned' | 'suspended_lost' | 'disabled'
        lostAt: string | null
      }
    >()
  }

  return new Map([
    [
      member.cardNo,
      {
        cardCode: member.cardCode,
        status: member.cardStatus,
        lostAt: member.cardLostAt,
      },
    ],
  ])
}

function hasAccessWindowChanged(
  currentMember: NonNullable<Awaited<ReturnType<typeof readMemberWithCardCode>>>,
  nextBeginTime: string,
  nextEndTime: string,
) {
  return (
    getAccessDateTimeValue(currentMember.beginTime) !== nextBeginTime ||
    getAccessDateTimeValue(currentMember.endTime) !== nextEndTime
  )
}

export function isDirectMemberEditPayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  return DIRECT_EDIT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key))
}

export async function executeDirectMemberEdit(
  id: string,
  input: DirectMemberEditInput,
  client: DirectMemberEditClient,
): Promise<DirectMemberEditResult> {
  const validationError = validateAccessWindow(input.beginTime, input.endTime)

  if (validationError) {
    return {
      ok: false,
      error: validationError,
      status: 400,
    }
  }

  const currentMember = await readMemberWithCardCode(client, id)

  if (!currentMember) {
    return {
      ok: false,
      error: 'Member not found.',
      status: 404,
    }
  }

  const prefixedName = buildHikMemberName(input.name, currentMember.cardCode)
  const accessWindowChanged = hasAccessWindowChanged(
    currentMember,
    input.beginTime,
    input.endTime,
  )
  const memberTypeUpdateValues = await buildMemberTypeUpdateValues(
    client,
    input.member_type_id,
    currentMember.type,
  )
  const { data: updatedRecord, error } = await client
    .from('members')
    .update({
      name: prefixedName,
      ...memberTypeUpdateValues,
      gender: input.gender ?? null,
      email: normalizeOptionalText(input.email),
      phone: normalizeOptionalText(input.phone),
      remark: normalizeOptionalText(input.remark),
      ...(Object.prototype.hasOwnProperty.call(input, 'joined_at')
        ? { joined_at: input.joined_at ?? null }
        : {}),
      begin_time: input.beginTime,
      end_time: input.endTime,
      ...(accessWindowChanged
        ? {
            status: resolveMemberStatusForAccessWindowUpdate({
              currentStatus: currentMember.status,
              endTime: input.endTime,
            }),
          }
        : {}),
    })
    .eq('id', id)
    .select(MEMBER_RECORD_SELECT)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to update member ${id}: ${error.message}`)
  }

  if (!updatedRecord) {
    return {
      ok: false,
      error: 'Member not found.',
      status: 404,
    }
  }

  const member = mapMemberRecordToMemberWithCardCode(
    updatedRecord as MemberRecord,
    buildCardLookupFromMember(currentMember),
  )

  if (!accessWindowChanged) {
    return {
      ok: true,
      member,
    }
  }

  try {
    const addUserJob = await createAndWaitForAccessControlJob({
      jobType: 'add_user',
      payload: buildAddUserPayloadWithAccessWindow({
        employeeNo: currentMember.employeeNo,
        name: prefixedName,
        beginTime: input.beginTime,
        endTime: input.endTime,
      }),
      messages: {
        createErrorPrefix: 'Failed to create add user job',
        missingJobIdMessage: 'Failed to create add user job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read add user job ${jobId}`,
        missingJobMessage: (jobId) => `Add user job ${jobId} was not found after creation.`,
        failedJobMessage: 'Add user job failed.',
        timeoutMessage: UPDATE_MEMBER_TIMEOUT_ERROR,
      },
      supabase: client,
    })

    if (addUserJob.status !== 'done') {
      return {
        ok: true,
        member,
        warning: UPDATE_MEMBER_WARNING,
      }
    }
  } catch (syncError) {
    console.error('Failed to sync updated member access window:', syncError)

    return {
      ok: true,
      member,
      warning: UPDATE_MEMBER_WARNING,
    }
  }

  return {
    ok: true,
    member,
  }
}
