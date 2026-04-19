import { z } from 'zod'
import type { Profile, StaffGender, UserRole } from '@/types'

export const STAFF_TITLES = [
  'Owner',
  'Trainer',
  'Medical',
  'Physiotherapist/Nutritionist',
  'Administrative Assistant',
  'Assistant',
] as const

export const TRAINER_SPECIALTIES = [
  'Strength Training',
  'Weight Loss',
  'Functional Training',
  'Flexibility & Mobility Training',
  'HIIT',
  'Cardio Training',
  'Combat/Boxing Training',
  'Endurance',
  'Cross Training',
  'Recovery Training',
  'Powerlifting',
  'Core Training',
  'Rehabilitation Training',
] as const

export const STAFF_GENDERS = ['male', 'female', 'other'] as const
export const STAFF_EDITABLE_GENDERS = ['male', 'female'] as const

export type StaffTitle = (typeof STAFF_TITLES)[number]
export type StaffListFilter = 'All' | StaffTitle
export type EditableStaffGender = (typeof STAFF_EDITABLE_GENDERS)[number]
export type TrainerSpecialty = (typeof TRAINER_SPECIALTIES)[number]
export type ExistingStaffProfileSummary = {
  id: string
  name: string
  titles: StaffTitle[]
}
export type StaffRemovalHistory = {
  trainerAssignments: number
  ptSessions: number
  sessionChanges: number
  rescheduleRequestsRequested: number
  rescheduleRequestsReviewed: number
  sessionUpdateRequestsRequested: number
  sessionUpdateRequestsReviewed: number
  memberApprovalRequestsSubmitted: number
  memberEditRequestsReviewed: number
  memberPaymentRequestsReviewed: number
  memberExtensionRequestsRequested: number
  memberExtensionRequestsReviewed: number
  memberPauseRequestsRequested: number
  memberPauseRequestsReviewed: number
  memberPauseResumeRequestsRequested: number
  memberPauseResumeRequestsReviewed: number
  total: number
}
export type StaffRemoval = {
  mode: 'blocked' | 'archive' | 'delete'
  activeAssignments: number
  history: StaffRemovalHistory
}
export type StaffDetail = {
  profile: Profile
  removal: StaffRemoval
}
export type ReadStaffOptions = {
  includeArchived?: boolean
  archivedOnly?: boolean
}

export const STAFF_PROFILE_SELECT =
  'id, name, email, role, titles, isSuspended:is_suspended, phone, gender, remark, specialties, photoUrl:photo_url, archivedAt:archived_at, created_at'

type StaffListSuccessResponse = {
  staff: Profile[]
}

type StaffDetailSuccessResponse = {
  profile: Profile
  removal: StaffRemoval
}

type StaffErrorResponse = {
  ok?: false
  error: string
}

export type StaffReadClient = {
  from(table: string): any
}

const staffGenderSchema = z.enum(STAFF_GENDERS)

const profileRecordSchema = z.object({
  id: z.string().trim().min(1, 'Profile id is required.'),
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().min(1, 'Email is required.'),
  role: z.enum(['admin', 'staff']),
  titles: z.array(z.string()).nullable().optional(),
  isSuspended: z.boolean(),
  phone: z.string().trim().min(1).nullable(),
  gender: staffGenderSchema.nullable(),
  remark: z.string().trim().min(1).nullable(),
  specialties: z.array(z.string()).nullable().optional(),
  photoUrl: z.string().trim().min(1).nullable(),
  archivedAt: z.string().trim().min(1).nullable().optional(),
  created_at: z.string().trim().min(1, 'Created timestamp is required.'),
})

const existingStaffProfileSummarySchema = z.object({
  id: z.string().trim().min(1, 'Profile id is required.'),
  name: z.string().trim().min(1, 'Name is required.'),
  titles: z.array(z.string()).nullable().optional(),
})

const staffListResponseSchema = z.object({
  staff: z.array(profileRecordSchema).default([]),
})

const staffDetailResponseSchema = z.object({
  profile: profileRecordSchema,
  removal: z.object({
    mode: z.enum(['blocked', 'archive', 'delete']),
    activeAssignments: z.number().int().nonnegative(),
    history: z.object({
      trainerAssignments: z.number().int().nonnegative(),
      ptSessions: z.number().int().nonnegative(),
      sessionChanges: z.number().int().nonnegative(),
      rescheduleRequestsRequested: z.number().int().nonnegative(),
      rescheduleRequestsReviewed: z.number().int().nonnegative(),
      sessionUpdateRequestsRequested: z.number().int().nonnegative(),
      sessionUpdateRequestsReviewed: z.number().int().nonnegative(),
      memberApprovalRequestsSubmitted: z.number().int().nonnegative(),
      memberEditRequestsReviewed: z.number().int().nonnegative(),
      memberPaymentRequestsReviewed: z.number().int().nonnegative(),
      memberExtensionRequestsRequested: z.number().int().nonnegative(),
      memberExtensionRequestsReviewed: z.number().int().nonnegative(),
      memberPauseRequestsRequested: z.number().int().nonnegative(),
      memberPauseRequestsReviewed: z.number().int().nonnegative(),
      memberPauseResumeRequestsRequested: z.number().int().nonnegative(),
      memberPauseResumeRequestsReviewed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  }),
})

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : ''
}

function normalizeNullableText(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

export function normalizeStaffTitles(
  titles: ReadonlyArray<string> | string | null | undefined,
): StaffTitle[] {
  const titleValues = Array.isArray(titles)
    ? titles
    : typeof titles === 'string'
      ? [titles]
      : []
  const selectedTitles = new Set(
    titleValues
      .map((title) => normalizeText(title))
      .filter((title): title is StaffTitle => isStaffTitle(title)),
  )

  return STAFF_TITLES.filter((title) => selectedTitles.has(title))
}

export function hasStaffTitle(
  titles: ReadonlyArray<string> | string | null | undefined,
  title: StaffTitle,
) {
  return normalizeStaffTitles(titles).includes(title)
}

export function isFrontDeskStaff(
  titles: ReadonlyArray<string> | string | null | undefined,
) {
  const normalizedTitles = normalizeStaffTitles(titles)
  const hasTrainerTitle = normalizedTitles.includes('Trainer')
  const hasFrontDeskTitle =
    normalizedTitles.includes('Administrative Assistant') ||
    normalizedTitles.includes('Assistant')

  return hasFrontDeskTitle && !hasTrainerTitle
}

export function formatStaffTitles(
  titles: ReadonlyArray<string> | string | null | undefined,
) {
  return normalizeStaffTitles(titles).join(', ')
}

export function normalizeTrainerSpecialties(
  specialties: ReadonlyArray<string> | null | undefined,
): TrainerSpecialty[] {
  if (!Array.isArray(specialties)) {
    return []
  }

  const selectedSpecialties = new Set(
    specialties.filter(
      (specialty): specialty is TrainerSpecialty =>
        TRAINER_SPECIALTIES.includes(specialty as TrainerSpecialty),
    ),
  )

  return TRAINER_SPECIALTIES.filter((specialty) => selectedSpecialties.has(specialty))
}

export function normalizeStaffSpecialtiesForTitles(
  titles: ReadonlyArray<string> | string | null | undefined,
  specialties: ReadonlyArray<string> | null | undefined,
): TrainerSpecialty[] {
  if (!hasStaffTitle(titles, 'Trainer')) {
    return []
  }

  return normalizeTrainerSpecialties(specialties)
}

function normalizeTimestamp(value: string) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    throw new Error('Created timestamp is required.')
  }

  const timestamp = new Date(normalizedValue)

  if (Number.isNaN(timestamp.getTime())) {
    return normalizedValue
  }

  return timestamp.toISOString()
}

function normalizeOptionalTimestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  return normalizeTimestamp(value)
}

export function mapProfileRecordToProfile(
  record: z.infer<typeof profileRecordSchema>,
): Profile {
  const titles = normalizeStaffTitles(record.titles)

  return {
    id: normalizeText(record.id),
    name: normalizeText(record.name),
    email: normalizeText(record.email),
    role: deriveRoleFromTitles(titles),
    titles,
    isSuspended: record.isSuspended,
    phone: normalizeNullableText(record.phone),
    gender: record.gender,
    remark: normalizeNullableText(record.remark),
    specialties: normalizeStaffSpecialtiesForTitles(titles, record.specialties),
    photoUrl: normalizeNullableText(record.photoUrl),
    archivedAt: normalizeOptionalTimestamp(record.archivedAt ?? null),
    created_at: normalizeTimestamp(record.created_at),
  }
}

function mapExistingStaffProfileSummary(
  record: z.infer<typeof existingStaffProfileSummarySchema>,
): ExistingStaffProfileSummary {
  return {
    id: normalizeText(record.id),
    name: normalizeText(record.name),
    titles: normalizeStaffTitles(record.titles),
  }
}

export function normalizeProfiles(input: unknown): Profile[] {
  const parsed = staffListResponseSchema.safeParse(input)

  if (!parsed.success) {
    return []
  }

  return parsed.data.staff.map(mapProfileRecordToProfile)
}

export function normalizeProfile(input: unknown): Profile | null {
  const parsed = z
    .object({
      profile: profileRecordSchema,
    })
    .safeParse(input)

  if (!parsed.success) {
    return null
  }

  return mapProfileRecordToProfile(parsed.data.profile)
}

export function normalizeStaffDetail(input: unknown): StaffDetail | null {
  const parsed = staffDetailResponseSchema.safeParse(input)

  if (!parsed.success) {
    return null
  }

  return {
    profile: mapProfileRecordToProfile(parsed.data.profile),
    removal: parsed.data.removal,
  }
}

export function normalizeExistingStaffProfileSummary(
  input: unknown,
): ExistingStaffProfileSummary | null {
  const parsed = existingStaffProfileSummarySchema.safeParse(input)

  if (!parsed.success) {
    return null
  }

  return mapExistingStaffProfileSummary(parsed.data)
}

export function isStaffTitle(value: string | null | undefined): value is StaffTitle {
  return STAFF_TITLES.includes(value as StaffTitle)
}

export function filterStaffByTitle(staff: Profile[], filter: StaffListFilter) {
  if (filter === 'All') {
    return staff
  }

  return staff.filter((profile) => profile.titles.includes(filter))
}

export function deriveRoleFromTitles(
  titles: ReadonlyArray<string> | string | null | undefined,
): UserRole {
  return hasStaffTitle(titles, 'Owner') ? 'admin' : 'staff'
}

export function shouldShowOwnerWarning(
  titles: ReadonlyArray<string> | string | null | undefined,
) {
  return hasStaffTitle(titles, 'Owner')
}

export function isEditableStaffGender(
  value: string | null | undefined,
): value is EditableStaffGender {
  return STAFF_EDITABLE_GENDERS.includes(value as EditableStaffGender)
}

export function formatStaffGenderLabel(gender: StaffGender | null) {
  if (!gender) {
    return 'Not set'
  }

  return gender.charAt(0).toUpperCase() + gender.slice(1)
}

function applyArchivedFilter(query: any, options: ReadStaffOptions = {}) {
  if (options.archivedOnly) {
    return typeof query?.not === 'function' ? query.not('archived_at', 'is', null) : query
  }

  if (options.includeArchived) {
    return query
  }

  return typeof query?.is === 'function' ? query.is('archived_at', null) : query
}

export async function readStaffProfiles(
  supabase: StaffReadClient,
  options: ReadStaffOptions = {},
) {
  const { data, error } = await applyArchivedFilter(
    supabase.from('profiles').select(STAFF_PROFILE_SELECT),
    options,
  ).order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to read staff profiles: ${error.message}`)
  }

  return normalizeProfiles({
    staff: data ?? [],
  })
}

export async function readStaffProfile(
  supabase: StaffReadClient,
  id: string,
  options: ReadStaffOptions = {},
) {
  const { data, error } = await applyArchivedFilter(
    supabase.from('profiles').select(STAFF_PROFILE_SELECT).eq('id', id),
    options,
  ).maybeSingle()

  if (error) {
    throw new Error(`Failed to read staff profile ${id}: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return normalizeProfile({
    profile: data,
  })
}

export async function fetchStaff(
  options: {
    archived?: boolean
  } = {},
): Promise<Profile[]> {
  const searchParams = new URLSearchParams()

  if (options.archived) {
    searchParams.set('archived', '1')
  }

  const response = await fetch(`/api/staff${searchParams.size > 0 ? `?${searchParams}` : ''}`, {
    method: 'GET',
  })

  let responseBody: StaffListSuccessResponse | StaffErrorResponse | null = null

  try {
    responseBody = (await response.json()) as StaffListSuccessResponse | StaffErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || 'error' in responseBody) {
    throw new Error(
      responseBody && 'error' in responseBody ? responseBody.error : 'Failed to load staff.',
    )
  }

  return normalizeProfiles(responseBody)
}

export async function fetchStaffProfile(id: string): Promise<StaffDetail> {
  const response = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'GET',
  })

  let responseBody: StaffDetailSuccessResponse | StaffErrorResponse | null = null

  try {
    responseBody = (await response.json()) as StaffDetailSuccessResponse | StaffErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || 'error' in responseBody) {
    throw new Error(
      responseBody && 'error' in responseBody
        ? responseBody.error
        : 'Failed to load staff profile.',
    )
  }

  const detail = normalizeStaffDetail(responseBody)

  if (!detail) {
    throw new Error('Failed to load staff profile.')
  }

  return detail
}
