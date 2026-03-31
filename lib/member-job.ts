import { z } from 'zod'
import { getManualCardNoValidationError } from '@/lib/card-no'
import type {
  AvailableAccessSlot,
  DeviceAccessState,
  Member,
  MemberType,
} from '@/types'

const memberTypeValues = ['General', 'Civil Servant', 'Student/BPO'] as const
const memberCardSourceValues = ['inventory', 'manual'] as const
const placeholderSlotNamePattern = /^[A-Z]\d{1,2}$/
export const DEFAULT_RESET_SLOT_END_TIME = '2037-12-31T23:59:59'

const expiryDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry must be in YYYY-MM-DD format.')

function validateManualCardNo(
  input: {
    cardSource: (typeof memberCardSourceValues)[number]
    cardNo: string
  },
  ctx: z.RefinementCtx,
) {
  if (input.cardSource !== 'manual') {
    return
  }

  const validationError = getManualCardNoValidationError(input.cardNo)

  if (!validationError) {
    return
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['cardNo'],
    message: validationError,
  })
}

export const availableAccessCardSchema = z.object({
  cardNo: z.string().trim().min(1, 'Card number is required.'),
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
  expiry: expiryDateSchema,
  cardSource: z.enum(memberCardSourceValues),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
}).superRefine(validateManualCardNo)

export const addMemberUserJobRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  name: z.string().trim().min(1, 'Name is required.'),
  expiry: expiryDateSchema,
})

export const provisionMemberAccessRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  expiry: expiryDateSchema,
  cardSource: z.enum(memberCardSourceValues),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
}).superRefine(validateManualCardNo)

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

type BuildMemberPreviewOptions = {
  now?: Date
  employeeNo?: string
  deviceAccessState?: DeviceAccessState
  slotPlaceholderName?: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatDatePart(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function generateEmployeeNo(now: Date = new Date()) {
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
  const randomSuffix = String(
    parseInt(crypto.randomUUID().replaceAll('-', '').slice(0, 12), 16) % 1_000_000,
  ).padStart(6, '0')

  return `${timestamp}${randomSuffix}`
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

export function buildAssignSlotPayload(
  { employeeNo, name, expiry }: AssignAccessSlotJobRequest,
  now: Date = new Date(),
): AddUserPayload {
  return buildAddUserPayload(
    {
      employeeNo,
      name,
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
    expiry,
    slot,
  }: {
    name: string
    type: MemberType
    expiry: string
    slot: AvailableAccessSlot
  },
  {
    now = new Date(),
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
    slotPlaceholderName,
    type,
    status: 'Active',
    deviceAccessState,
    expiry,
    balance: 0,
    createdAt: now.toISOString(),
  }
}

export function buildMemberPreview(
  {
    name,
    type,
    expiry,
    cardNo,
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
    type,
    status: 'Active',
    deviceAccessState,
    expiry,
    balance: 0,
    createdAt: now.toISOString(),
  }
}
