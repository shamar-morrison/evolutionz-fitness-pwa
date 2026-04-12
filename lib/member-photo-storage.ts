import type { Member } from '@/types'

export const MEMBER_PHOTOS_BUCKET = 'member-photos'

type StorageError = {
  message: string
}

export type MemberPhotoStorageClient = {
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
      move(
        fromPath: string,
        toPath: string,
      ): PromiseLike<{
        data: { path: string } | null
        error: StorageError | null
      }>
    }
  }
}

export function buildMemberPhotoPath(memberId: string) {
  return `${memberId}.jpg`
}

export function buildPendingMemberRequestPhotoPath(requestId: string) {
  return `pending-member-requests/${requestId}.jpg`
}

export function getMemberPhotoPublicUrl(
  storageClient: MemberPhotoStorageClient,
  path: string,
) {
  return storageClient.storage.from(MEMBER_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function uploadMemberPhotoObject(
  storageClient: MemberPhotoStorageClient,
  memberId: string,
  fileBody: ArrayBuffer,
) {
  const path = buildMemberPhotoPath(memberId)
  return uploadMemberPhotoAtPath(storageClient, path, fileBody)
}

export async function uploadMemberPhotoAtPath(
  storageClient: MemberPhotoStorageClient,
  path: string,
  fileBody: ArrayBuffer,
) {
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

export async function moveMemberPhotoObject(
  storageClient: MemberPhotoStorageClient,
  fromPath: string,
  toPath: string,
) {
  const { error } = await storageClient.storage
    .from(MEMBER_PHOTOS_BUCKET)
    .move(fromPath, toPath)

  if (error) {
    throw new Error(`Failed to move member photo: ${error.message}`)
  }

  return toPath
}

export function hydrateMemberPhotoUrl(
  storageClient: MemberPhotoStorageClient,
  member: Member,
) {
  if (!member.photoUrl) {
    return member
  }

  const publicUrl = getMemberPhotoPublicUrl(storageClient, member.photoUrl)

  if (!publicUrl) {
    return {
      ...member,
      photoUrl: null,
    }
  }

  return {
    ...member,
    photoUrl: publicUrl,
  }
}
