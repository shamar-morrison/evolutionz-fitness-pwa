import { z } from 'zod'
import type { DeviceAccessState, Member } from '@/types'

const memberTypeValues = ['General', 'Civil Servant', 'Student/BPO'] as const

const expiryDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry must be in YYYY-MM-DD format.')

export const addMemberRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
  type: z.enum(memberTypeValues),
  expiry: expiryDateSchema,
})

export const addMemberUserJobRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  name: z.string().trim().min(1, 'Name is required.'),
  expiry: expiryDateSchema,
})

export const addMemberCardJobRequestSchema = z.object({
  employeeNo: z.string().trim().min(1, 'Employee number is required.'),
  cardNo: z.string().trim().min(1, 'Card number is required.'),
})

export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>
export type AddMemberUserJobRequest = z.infer<typeof addMemberUserJobRequestSchema>
export type AddMemberCardJobRequest = z.infer<typeof addMemberCardJobRequestSchema>

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
  const randomSuffix = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()

  return `EVZ-${timestamp}-${randomSuffix}`
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

export function buildAddCardPayload({
  employeeNo,
  cardNo,
}: AddMemberCardJobRequest): AddCardPayload {
  return {
    employeeNo: employeeNo.trim(),
    cardNo: cardNo.trim(),
  }
}

export function buildMemberPreview(
  { name, cardNo, type, expiry }: AddMemberRequest,
  {
    now = new Date(),
    employeeNo = generateEmployeeNo(now),
    deviceAccessState = 'ready',
  }: BuildMemberPreviewOptions = {},
): Member {
  return {
    id: employeeNo,
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
