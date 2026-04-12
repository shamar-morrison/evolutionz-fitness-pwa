import type { Profile } from '@/types'

export const STAFF_PHOTOS_BUCKET = 'staff-photos'

type StorageError = {
  message: string
}

export type StaffPhotoStorageClient = {
  storage: {
    from(bucket: string): {
      getPublicUrl(path: string): {
        data: { publicUrl: string }
      }
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

export function getStaffPhotoPublicUrl(
  storageClient: StaffPhotoStorageClient,
  path: string,
) {
  return storageClient.storage.from(STAFF_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl
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

export function hydrateStaffPhotoUrl(
  storageClient: StaffPhotoStorageClient,
  profile: Profile,
) {
  if (!profile.photoUrl) {
    return profile
  }

  const publicUrl = getStaffPhotoPublicUrl(storageClient, profile.photoUrl)

  if (!publicUrl) {
    return {
      ...profile,
      photoUrl: null,
    }
  }

  return {
    ...profile,
    photoUrl: publicUrl,
  }
}

export function hydrateStaffPhotoUrls(
  storageClient: StaffPhotoStorageClient,
  staff: Profile[],
) {
  return staff.map((profile) => hydrateStaffPhotoUrl(storageClient, profile))
}
