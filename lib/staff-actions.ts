import {
  normalizeProfile,
  type EditableStaffGender,
  type StaffTitle,
} from '@/lib/staff'
import type { Profile } from '@/types'

type StaffMutationErrorResponse = {
  ok: false
  error: string
}

type ProfileMutationSuccessResponse = {
  ok: true
  profile: Profile
}

type DeleteStaffSuccessResponse = {
  ok: true
  warning?: string
}

type UploadStaffPhotoSuccessResponse = {
  ok: true
  photo_url: string
}

export type CreateStaffData = {
  name: string
  email: string
  password: string
  phone?: string
  gender?: EditableStaffGender
  remark?: string
  title: StaffTitle
}

export type UpdateStaffData = {
  name: string
  phone?: string | null
  gender?: EditableStaffGender | null
  remark?: string | null
  title: StaffTitle
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

export async function createStaff(data: CreateStaffData): Promise<Profile> {
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
      title: data.title,
    }),
  })

  return parseProfileMutationResponse(response, 'Failed to create staff.')
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
      title: data.title,
    }),
  })

  return parseProfileMutationResponse(response, 'Failed to update staff.')
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
