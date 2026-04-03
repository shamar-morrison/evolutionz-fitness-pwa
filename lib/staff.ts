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

export const STAFF_GENDERS = ['male', 'female', 'other'] as const

export type StaffTitle = (typeof STAFF_TITLES)[number]
export type StaffListFilter = 'All' | StaffTitle

export const STAFF_PROFILE_SELECT =
  'id, name, email, role, title, phone, gender, remark, photoUrl:photo_url, created_at'

type StaffListSuccessResponse = {
  staff: Profile[]
}

type StaffDetailSuccessResponse = {
  profile: Profile
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
  title: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1).nullable(),
  gender: staffGenderSchema.nullable(),
  remark: z.string().trim().min(1).nullable(),
  photoUrl: z.string().trim().min(1).nullable(),
  created_at: z.string().trim().min(1, 'Created timestamp is required.'),
})

const staffListResponseSchema = z.object({
  staff: z.array(profileRecordSchema).default([]),
})

const staffDetailResponseSchema = z.object({
  profile: profileRecordSchema,
})

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : ''
}

function normalizeNullableText(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
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

export function mapProfileRecordToProfile(
  record: z.infer<typeof profileRecordSchema>,
): Profile {
  return {
    id: normalizeText(record.id),
    name: normalizeText(record.name),
    email: normalizeText(record.email),
    role: record.role,
    title: normalizeNullableText(record.title),
    phone: normalizeNullableText(record.phone),
    gender: record.gender,
    remark: normalizeNullableText(record.remark),
    photoUrl: normalizeNullableText(record.photoUrl),
    created_at: normalizeTimestamp(record.created_at),
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
  const parsed = staffDetailResponseSchema.safeParse(input)

  if (!parsed.success) {
    return null
  }

  return mapProfileRecordToProfile(parsed.data.profile)
}

export function isStaffTitle(value: string | null | undefined): value is StaffTitle {
  return STAFF_TITLES.includes(value as StaffTitle)
}

export function filterStaffByTitle(staff: Profile[], filter: StaffListFilter) {
  if (filter === 'All') {
    return staff
  }

  return staff.filter((profile) => profile.title === filter)
}

export function deriveRoleFromTitle(title: StaffTitle): UserRole {
  return title === 'Owner' ? 'admin' : 'staff'
}

export function shouldShowOwnerWarning(title: string | null | undefined) {
  return title === 'Owner'
}

export function formatStaffGenderLabel(gender: StaffGender | null) {
  if (!gender) {
    return 'Not set'
  }

  return gender.charAt(0).toUpperCase() + gender.slice(1)
}

export async function readStaffProfiles(supabase: StaffReadClient) {
  const { data, error } = await supabase
    .from('profiles')
    .select(STAFF_PROFILE_SELECT)
    .order('created_at', { ascending: true })

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
) {
  const { data, error } = await supabase
    .from('profiles')
    .select(STAFF_PROFILE_SELECT)
    .eq('id', id)
    .maybeSingle()

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

export async function fetchStaff(): Promise<Profile[]> {
  const response = await fetch('/api/staff', {
    method: 'GET',
    cache: 'no-store',
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

export async function fetchStaffProfile(id: string): Promise<Profile> {
  const response = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'GET',
    cache: 'no-store',
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

  const profile = normalizeProfile(responseBody)

  if (!profile) {
    throw new Error('Failed to load staff profile.')
  }

  return profile
}
