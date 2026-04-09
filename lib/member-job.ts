import { z } from 'zod'
import { buildHikMemberName } from '@/lib/member-name'
import type {
  AvailableAccessSlot,
  DeviceAccessState,
  Member,
  MemberGender,
  MemberType,
} from '@/types'

const memberTypeValues = ['General', 'Civil Servant', 'Student/BPO'] as const
const memberGenderValues = ['Male', 'Female'] as const
export const DEFAULT_PLACEHOLDER_SLOT_PATTERN = '^[A-Z]\\d{1,2}$'
const placeholderSlotNamePattern = new RegExp(DEFAULT_PLACEHOLDER_SLOT_PATTERN)
export const DEFAULT_RESET_SLOT_END_TIME = '2037-12-31T23:59:59'
export const MAX_SHORT_EMPLOYEE_NO = 999_999_999

const expiryDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry must be in YYYY-MM-DD format.')
const memberDateTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Datetime must be in YYYY-MM-DDTHH:mm:ss format.')
const memberGenderSchema = z.enum(memberGenderValues)
const memberOptionalTextSchema = z.string().trim().min(1).optional()

export const availableAccessCardSchema = z.object({
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  cardCode: z.string().trim().min(1).nullable(),
})

export const availableAccessSlotSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Person ID is required.'),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  placeholderName: z
    .string()
    .trim()
    .regex(placeholderSlotNamePattern, 'Placeholder slot name must match the Hik slot pattern.'),
})

export const addMemberRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  type: z.enum(memberTypeValues),
  gender: memberGenderSchema.optional(),
  email: z.string().trim().email('Email must be valid.').optional(),
  phone: memberOptionalTextSchema,
  remark: memberOptionalTextSchema,
  beginTime: memberDateTimeSchema,
  endTime: memberDateTimeSchema,
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  cardCode: z.string().trim().min(1, 'Card code is required.'),
})

export const addMemberUserJobRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  name: z.string().trim().min(1, 'Name is required.'),
  expiry: expiryDateSchema,
})

export const provisionMemberAccessRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  type: z.enum(memberTypeValues),
  gender: memberGenderSchema.optional(),
  email: z.string().trim().email('Email must be valid.').optional(),
  phone: memberOptionalTextSchema,
  remark: memberOptionalTextSchema,
  beginTime: memberDateTimeSchema,
  endTime: memberDateTimeSchema,
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  cardCode: z.string().trim().min(1, 'Card code is required.'),
})

export const addMemberCardJobRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
})

export const assignAccessSlotJobRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Person ID is required.'),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  placeholderName: z
    .string()
    .trim()
    .regex(placeholderSlotNamePattern, 'Placeholder slot name must match the Hik slot pattern.'),
  name: z.string().trim().min(1, 'Name is required.'),
  expiry: expiryDateSchema,
})

export const resetAccessSlotJobRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Person ID is required.'),
  placeholderName: z
    .string()
    .trim()
    .regex(placeholderSlotNamePattern, 'Placeholder slot name must match the Hik slot pattern.'),
})

export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>
export type AddMemberUserJobRequest = z.infer<typeof addMemberUserJobRequestSchema>
export type ProvisionMemberAccessRequest = z.infer<typeof provisionMemberAccessRequestSchema>
export type AddMemberCardJobRequest = z.infer<typeof addMemberCardJobRequestSchema>
export type AssignAccessSlotJobRequest = z.infer<typeof assignAccessSlotJobRequestSchema>
export type ResetAccessSlotJobRequest = z.infer<typeof resetAccessSlotJobRequestSchema>

export type AddUserPayload = {
  employeeNo: string
  name: string
  userType: 'normal'
  beginTime: string
  endTime: string
}

export type AddCardPayload = {
  employeeNo: string
  cardNo: string
}

export type AddUserAccessWindowRequest = {
  employeeNo: string
  name: string
  beginTime: string
  endTime: string
}

type BuildMemberPreviewOptions = {
  now?: Date
  employeeNo?: string
  deviceAccessState?: DeviceAccessState
  slotPlaceholderName?: string
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatDatePart(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function generateEmployeeNo(now: Date = new Date()) {
  return String(now.getTime()).slice(-9)
}

export function isShortNumericEmployeeNo(value: string | null | undefined) {
  return /^\d{1,9}$/.test(normalizeText(value))
}

export function ensureUniqueShortEmployeeNo(
  startEmployeeNo: string,
  existingEmployeeNos: string[],
) {
  const normalizedStartEmployeeNo = normalizeText(startEmployeeNo)
  const existingEmployeeNoSet = new Set(
    existingEmployeeNos.map((employeeNo) => normalizeText(employeeNo)).filter(Boolean),
  )

  if (!isShortNumericEmployeeNo(normalizedStartEmployeeNo)) {
    throw new Error('Failed to derive a unique short numeric employee number.')
  }

  let candidate = Number(normalizedStartEmployeeNo)

  while (
    Number.isSafeInteger(candidate) &&
    candidate > 0 &&
    candidate <= MAX_SHORT_EMPLOYEE_NO
  ) {
    const candidateValue = String(candidate)

    if (!existingEmployeeNoSet.has(candidateValue)) {
      return candidateValue
    }

    candidate += 1
  }

  throw new Error('Failed to derive a unique short numeric employee number.')
}

export function getNextShortEmployeeNo(
  existingEmployeeNos: string[],
  fallbackEmployeeNo: string,
) {
  const normalizedExistingEmployeeNos = existingEmployeeNos
    .map((employeeNo) => normalizeText(employeeNo))
    .filter(Boolean)
  const shortNumericEmployeeNos = normalizedExistingEmployeeNos
    .filter((employeeNo) => isShortNumericEmployeeNo(employeeNo))
    .map((employeeNo) => Number(employeeNo))
  const nextEmployeeNo =
    shortNumericEmployeeNos.length > 0
      ? String(Math.max(...shortNumericEmployeeNos) + 1)
      : fallbackEmployeeNo

  return ensureUniqueShortEmployeeNo(nextEmployeeNo, normalizedExistingEmployeeNos)
}

export function buildAddUserPayload(
  { employeeNo, name, expiry }: AddMemberUserJobRequest,
  now: Date = new Date(),
): AddUserPayload {
  const beginDate = formatDatePart(now)

  return {
    employeeNo: employeeNo.trim(),
    name: name.trim(),
    userType: 'normal',
    beginTime: `${beginDate}T00:00:00`,
    endTime: `${expiry}T23:59:59`,
  }
}

export function buildAddUserPayloadWithAccessWindow({
  employeeNo,
  name,
  beginTime,
  endTime,
}: AddUserAccessWindowRequest): AddUserPayload {
  return {
    employeeNo: employeeNo.trim(),
    name: name.trim(),
    userType: 'normal',
    beginTime: beginTime.trim(),
    endTime: endTime.trim(),
  }
}

export function buildAssignSlotPayload(
  { employeeNo, placeholderName, name, expiry }: AssignAccessSlotJobRequest,
  now: Date = new Date(),
): AddUserPayload {
  return buildAddUserPayload(
    {
      employeeNo,
      name: buildHikMemberName(name, placeholderName),
      expiry,
    },
    now,
  )
}

export function buildAddCardPayload({
  employeeNo,
  cardNo,
}: AddMemberCardJobRequest): AddCardPayload {
  return {
    employeeNo: employeeNo.trim(),
    cardNo: cardNo.trim(),
  }
}

export function buildResetSlotPayload(
  { employeeNo, placeholderName }: ResetAccessSlotJobRequest,
  now: Date = new Date(),
  resetEndTime: string = DEFAULT_RESET_SLOT_END_TIME,
): AddUserPayload {
  const beginDate = formatDatePart(now)

  return {
    employeeNo: employeeNo.trim(),
    name: placeholderName.trim(),
    userType: 'normal',
    beginTime: `${beginDate}T00:00:00`,
    endTime: resetEndTime,
  }
}

export function buildSlotBackedMemberPreview(
  {
    name,
    type,
    beginTime,
    endTime,
    slot,
    gender = null,
    email = null,
    phone = null,
    remark = null,
    photoUrl = null,
  }: {
    name: string
    type: MemberType
    beginTime: string
    endTime: string
    slot: AvailableAccessSlot
    gender?: MemberGender | null
    email?: string | null
    phone?: string | null
    remark?: string | null
    photoUrl?: string | null
  },
  {
    employeeNo = slot.employeeNo.trim(),
    deviceAccessState = 'ready',
    slotPlaceholderName = slot.placeholderName.trim(),
  }: BuildMemberPreviewOptions = {},
): Member {
  return {
    id: employeeNo,
    employeeNo,
    name: name.trim(),
    cardNo: slot.cardNo.trim(),
    cardCode: slot.placeholderName.trim(),
    cardStatus: 'assigned',
    cardLostAt: null,
    slotPlaceholderName,
    type,
    memberTypeId: null,
    status: 'Active',
    deviceAccessState,
    gender,
    email,
    phone,
    remark,
    photoUrl,
    beginTime,
    endTime,
  }
}

export function buildMemberPreview(
  {
    name,
    type,
    gender,
    email,
    phone,
    remark,
    beginTime,
    endTime,
    cardNo,
    cardCode,
  }: AddMemberRequest,
  {
    now = new Date(),
    employeeNo = generateEmployeeNo(now),
    deviceAccessState = 'ready',
  }: BuildMemberPreviewOptions = {},
): Member {
  return {
    id: employeeNo,
    employeeNo,
    name: name.trim(),
    cardNo: cardNo.trim(),
    cardCode: cardCode.trim(),
    cardStatus: 'assigned',
    cardLostAt: null,
    type,
    memberTypeId: null,
    status: 'Active',
    deviceAccessState,
    gender: gender ?? null,
    email: email ?? null,
    phone: phone ?? null,
    remark: remark ?? null,
    photoUrl: null,
    beginTime,
    endTime,
  }
}
