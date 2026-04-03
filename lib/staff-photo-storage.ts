import type { Profile } from '@/types'

export const STAFF_PHOTOS_BUCKET = 'staff-photos'
export const STAFF_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60

type StorageError = {
  message: string
}

export type StaffPhotoStorageClient = {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): PromiseLike<{
        data: { signedUrl: string } | null
        error: StorageError | null
      }>
      upload(
        path: string,
        fileBody: ArrayBuffer,
        options: {
          contentType: string
          upsert: boolean
        },
      ): PromiseLike<{
        data: { path?: string } | null
        error: StorageError | null
      }>
      remove(
        paths: string[],
      ): PromiseLike<{
        data: unknown
        error: StorageError | null
      }>
    }
  }
}

export function buildStaffPhotoPath(profileId: string) {
  return `${profileId}.jpg`
}

export async function createStaffPhotoSignedUrl(
  storageClient: StaffPhotoStorageClient,
  path: string,
  expiresInSeconds: number = STAFF_PHOTO_SIGNED_URL_TTL_SECONDS,
) {
  const { data, error } = await storageClient.storage
    .from(STAFF_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)

  if (error) {
    throw new Error(`Failed to create staff photo signed URL: ${error.message}`)
  }

  if (!data?.signedUrl) {
    throw new Error('Failed to create staff photo signed URL: missing signed URL in response.')
  }

  return data.signedUrl
}

export async function uploadStaffPhotoObject(
  storageClient: StaffPhotoStorageClient,
  profileId: string,
  fileBody: ArrayBuffer,
) {
  const path = buildStaffPhotoPath(profileId)
  const { error } = await storageClient.storage.from(STAFF_PHOTOS_BUCKET).upload(path, fileBody, {
    contentType: 'image/jpeg',
    upsert: true,
  })

  if (error) {
    throw new Error(`Failed to upload staff photo: ${error.message}`)
  }

  return path
}

export async function deleteStaffPhotoObject(
  storageClient: StaffPhotoStorageClient,
  path: string,
) {
  const { error } = await storageClient.storage.from(STAFF_PHOTOS_BUCKET).remove([path])

  if (error) {
    throw new Error(`Failed to delete staff photo: ${error.message}`)
  }
}

export async function hydrateStaffPhotoUrl(
  storageClient: StaffPhotoStorageClient,
  profile: Profile,
) {
  if (!profile.photoUrl) {
    return profile
  }

  try {
    const signedUrl = await createStaffPhotoSignedUrl(storageClient, profile.photoUrl)

    return {
      ...profile,
      photoUrl: signedUrl,
    }
  } catch (error) {
    console.error('Failed to sign staff photo URL:', error)

    return {
      ...profile,
      photoUrl: null,
    }
  }
}

export async function hydrateStaffPhotoUrls(
  storageClient: StaffPhotoStorageClient,
  staff: Profile[],
) {
  return Promise.all(staff.map((profile) => hydrateStaffPhotoUrl(storageClient, profile)))
}
