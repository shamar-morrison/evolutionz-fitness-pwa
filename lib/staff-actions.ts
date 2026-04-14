import {
  normalizeExistingStaffProfileSummary,
  normalizeProfile,
  type EditableStaffGender,
  type StaffTitle,
  type TrainerSpecialty,
} from '@/lib/staff'
import type { Profile } from '@/types'

type StaffMutationErrorResponse = {
  ok: false
  error: string
  code?: string
}

type ProfileMutationSuccessResponse = {
  ok: true
  profile: Profile
}

type CreateStaffDuplicateEmailResponse = {
  ok: false
  code: 'EMAIL_EXISTS'
  existingProfile: {
    id: string
    name: string
    titles: string[]
  }
}

type DeleteStaffSuccessResponse = {
  ok: true
  warning?: string
}

type ArchiveStaffSuccessResponse = {
  ok: true
  archivedAt: string
}

type UploadStaffPhotoSuccessResponse = {
  ok: true
  photo_url: string
}

type StaffMutationSuccessResponse = {
  ok: true
}

export type CreateStaffData = {
  name: string
  email: string
  password: string
  phone?: string
  gender?: EditableStaffGender
  remark?: string
  titles: StaffTitle[]
  specialties?: TrainerSpecialty[]
}

export type UpdateStaffData = {
  name: string
  phone?: string | null
  gender?: EditableStaffGender | null
  remark?: string | null
  titles: StaffTitle[]
  specialties?: TrainerSpecialty[]
}

export type AddStaffTitlesData = {
  titles: StaffTitle[]
  specialties?: TrainerSpecialty[]
}

export type CreateStaffResult =
  | {
      ok: true
      profile: Profile
    }
  | {
      ok: false
      code: 'EMAIL_EXISTS'
      existingProfile: NonNullable<ReturnType<typeof normalizeExistingStaffProfileSummary>>
    }

async function parseProfileMutationResponse(
  response: Response,
  errorMessage: string,
) {
  let responseBody: ProfileMutationSuccessResponse | StaffMutationErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | ProfileMutationSuccessResponse
      | StaffMutationErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false ? responseBody.error : errorMessage,
    )
  }

  const profile = normalizeProfile({
    profile: responseBody.profile,
  })

  if (!profile) {
    throw new Error('Failed to read the updated staff profile response.')
  }

  return profile
}

export async function createStaff(data: CreateStaffData): Promise<CreateStaffResult> {
  const response = await fetch('/api/staff', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      password: data.password,
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.gender ? { gender: data.gender } : {}),
      ...(data.remark ? { remark: data.remark } : {}),
      titles: data.titles,
      ...('specialties' in data ? { specialties: data.specialties ?? [] } : {}),
    }),
  })

  let responseBody:
    | ProfileMutationSuccessResponse
    | StaffMutationErrorResponse
    | CreateStaffDuplicateEmailResponse
    | null = null

  try {
    responseBody = (await response.json()) as
      | ProfileMutationSuccessResponse
      | StaffMutationErrorResponse
      | CreateStaffDuplicateEmailResponse
  } catch {
    responseBody = null
  }

  if (
    response.status === 409 &&
    responseBody &&
    'code' in responseBody &&
    responseBody.code === 'EMAIL_EXISTS' &&
    'existingProfile' in responseBody
  ) {
    const existingProfile = normalizeExistingStaffProfileSummary(responseBody.existingProfile)

    if (!existingProfile) {
      throw new Error('Failed to read the existing staff profile response.')
    }

    return {
      ok: false,
      code: 'EMAIL_EXISTS',
      existingProfile,
    }
  }

  if (!response.ok || !responseBody || ('ok' in responseBody && responseBody.ok === false)) {
    throw new Error(
      responseBody &&
        'ok' in responseBody &&
        responseBody.ok === false &&
        'error' in responseBody
        ? responseBody.error
        : 'Failed to create staff.',
    )
  }

  const profile = normalizeProfile({
    profile: responseBody.profile,
  })

  if (!profile) {
    throw new Error('Failed to read the updated staff profile response.')
  }

  return {
    ok: true,
    profile,
  }
}

export async function updateStaff(
  id: string,
  data: UpdateStaffData,
): Promise<Profile> {
  const response = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: data.name,
      phone: data.phone ?? null,
      ...('gender' in data ? { gender: data.gender ?? null } : {}),
      remark: data.remark ?? null,
      titles: data.titles,
      ...('specialties' in data ? { specialties: data.specialties ?? [] } : {}),
    }),
  })

  return parseProfileMutationResponse(response, 'Failed to update staff.')
}

export async function addStaffTitles(
  id: string,
  data: AddStaffTitlesData,
): Promise<Profile> {
  const response = await fetch(`/api/staff/${encodeURIComponent(id)}/add-title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      titles: data.titles,
      ...('specialties' in data ? { specialties: data.specialties ?? [] } : {}),
    }),
  })

  return parseProfileMutationResponse(response, 'Failed to add staff titles.')
}

export async function uploadStaffPhoto(
  id: string,
  photo: Blob,
): Promise<string> {
  const formData = new FormData()

  formData.append('photo', photo, `${id}.jpg`)

  const response = await fetch(`/api/staff/${encodeURIComponent(id)}/photo`, {
    method: 'POST',
    body: formData,
  })

  let responseBody: UploadStaffPhotoSuccessResponse | StaffMutationErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | UploadStaffPhotoSuccessResponse
      | StaffMutationErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || responseBody.ok === false) {
    throw new Error(
      responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to upload staff photo.',
    )
  }

  return responseBody.photo_url
}

export async function deleteStaffPhoto(id: string): Promise<void> {
  const response = await fetch(`/api/staff/${encodeURIComponent(id)}/photo`, {
    method: 'DELETE',
  })

  let responseBody: { ok: true } | StaffMutationErrorResponse | null = null

  try {
    responseBody = (await response.json()) as { ok: true } | StaffMutationErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || ('ok' in responseBody && responseBody.ok === false)) {
    throw new Error(
      responseBody && 'ok' in responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to delete staff photo.',
    )
  }
}

export async function deleteStaff(
  id: string,
): Promise<{ warning?: string }> {
  const response = await fetch(`/api/staff/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  let responseBody: DeleteStaffSuccessResponse | StaffMutationErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | DeleteStaffSuccessResponse
      | StaffMutationErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || ('ok' in responseBody && responseBody.ok === false)) {
    throw new Error(
      responseBody && 'ok' in responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to delete staff.',
    )
  }

  return {
    warning: typeof responseBody.warning === 'string' ? responseBody.warning : undefined,
  }
}

export async function archiveStaff(id: string): Promise<{ archivedAt: string }> {
  const response = await fetch(`/api/staff/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
  })

  let responseBody: ArchiveStaffSuccessResponse | StaffMutationErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | ArchiveStaffSuccessResponse
      | StaffMutationErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || ('ok' in responseBody && responseBody.ok === false)) {
    throw new Error(
      responseBody && 'ok' in responseBody && responseBody.ok === false
        ? responseBody.error
        : 'Failed to archive staff.',
    )
  }

  return {
    archivedAt: responseBody.archivedAt,
  }
}

export async function setStaffSuspended(id: string, suspended: boolean): Promise<void> {
  const response = await fetch(`/api/staff/${encodeURIComponent(id)}/suspend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      suspended,
    }),
  })

  let responseBody: StaffMutationSuccessResponse | StaffMutationErrorResponse | null = null

  try {
    responseBody = (await response.json()) as
      | StaffMutationSuccessResponse
      | StaffMutationErrorResponse
  } catch {
    responseBody = null
  }

  if (!response.ok || !responseBody || ('ok' in responseBody && responseBody.ok === false)) {
    throw new Error(
      responseBody && 'ok' in responseBody && responseBody.ok === false
        ? responseBody.error
        : `Failed to ${suspended ? 'suspend' : 'restore'} staff access.`,
    )
  }
}
