import type { Member } from '@/types'

export const MEMBER_PHOTOS_BUCKET = 'member-photos'
export const MEMBER_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60

type StorageError = {
  message: string
}

export type MemberPhotoStorageClient = {
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

export function buildMemberPhotoPath(memberId: string) {
  return `${memberId}.jpg`
}

export async function createMemberPhotoSignedUrl(
  storageClient: MemberPhotoStorageClient,
  path: string,
  expiresInSeconds: number = MEMBER_PHOTO_SIGNED_URL_TTL_SECONDS,
) {
  const { data, error } = await storageClient.storage
    .from(MEMBER_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)

  if (error) {
    throw new Error(`Failed to create member photo signed URL: ${error.message}`)
  }

  if (!data?.signedUrl) {
    throw new Error('Failed to create member photo signed URL: missing signed URL in response.')
  }

  return data.signedUrl
}

export async function uploadMemberPhotoObject(
  storageClient: MemberPhotoStorageClient,
  memberId: string,
  fileBody: ArrayBuffer,
) {
  const path = buildMemberPhotoPath(memberId)
  const { error } = await storageClient.storage.from(MEMBER_PHOTOS_BUCKET).upload(path, fileBody, {
    contentType: 'image/jpeg',
    upsert: true,
  })

  if (error) {
    throw new Error(`Failed to upload member photo: ${error.message}`)
  }

  return path
}

export async function deleteMemberPhotoObject(
  storageClient: MemberPhotoStorageClient,
  path: string,
) {
  const { error } = await storageClient.storage.from(MEMBER_PHOTOS_BUCKET).remove([path])

  if (error) {
    throw new Error(`Failed to delete member photo: ${error.message}`)
  }
}

export async function hydrateMemberPhotoUrl(
  storageClient: MemberPhotoStorageClient,
  member: Member,
) {
  if (!member.photoUrl) {
    return member
  }

  try {
    const signedUrl = await createMemberPhotoSignedUrl(storageClient, member.photoUrl)

    return {
      ...member,
      photoUrl: signedUrl,
    }
  } catch (error) {
    console.error('Failed to sign member photo URL:', error)

    return {
      ...member,
      photoUrl: null,
    }
  }
}
