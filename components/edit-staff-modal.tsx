'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MASKED_PASSWORD_VALUE,
  StaffFormFields,
  type StaffFormState,
} from '@/components/staff-form-fields'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { toast } from '@/hooks/use-toast'
import { compressImage } from '@/lib/compress-image'
import { queryKeys } from '@/lib/query-keys'
import { isStaffTitle } from '@/lib/staff'
import { updateStaff, uploadStaffPhoto, type UpdateStaffData } from '@/lib/staff-actions'
import type { Profile } from '@/types'

type EditStaffModalProps = {
  profile: Profile
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function normalizeEditStaffFormState(formState: StaffFormState) {
  return {
    name: formState.name.trim(),
    phone: formState.phone.trim(),
    gender: formState.gender,
    remark: formState.remark.trim(),
    title: formState.title,
  }
}

export function hasEditStaffChanges(
  initialFormState: StaffFormState,
  formData: StaffFormState,
  hasNewPhoto = false,
) {
  if (hasNewPhoto) {
    return true
  }

  const currentState = normalizeEditStaffFormState(formData)
  const initialState = normalizeEditStaffFormState(initialFormState)

  return JSON.stringify(currentState) !== JSON.stringify(initialState)
}

function createInitialFormState(profile: Profile): StaffFormState {
  return {
    name: profile.name,
    email: profile.email,
    password: MASKED_PASSWORD_VALUE,
    phone: profile.phone ?? '',
    gender: profile.gender ?? '',
    remark: profile.remark ?? '',
    title: isStaffTitle(profile.title) ? profile.title : '',
  }
}

export function EditStaffModal({ profile, open, onOpenChange, onSuccess }: EditStaffModalProps) {
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [photoFile, setPhotoFile] = useState<FileWithPreview | null>(null)
  const initialFormState = useMemo(() => createInitialFormState(profile), [profile])
  const [formData, setFormData] = useState<StaffFormState>(initialFormState)
  const hasChanges = useMemo(
    () => hasEditStaffChanges(initialFormState, formData, photoFile !== null),
    [formData, initialFormState, photoFile],
  )

  useEffect(() => {
    setFormData(initialFormState)
    setPhotoFile(null)
    setIsSubmitting(false)
  }, [initialFormState, open])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormData(initialFormState)
      setPhotoFile(null)
      setIsSubmitting(false)
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!formData.name.trim()) {
      toast({
        title: 'Full name required',
        description: 'Enter the staff member’s full name before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.title) {
      toast({
        title: 'Title required',
        description: 'Choose a title before saving this staff profile.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const payload: UpdateStaffData = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        gender: formData.gender || null,
        remark: formData.remark.trim() || null,
        title: formData.title,
      }
      const updatedProfile = await updateStaff(profile.id, payload)
      let photoUploadError: string | null = null

      if (photoFile) {
        try {
          const compressedPhoto = await compressImage(photoFile.file)
          await uploadStaffPhoto(profile.id, compressedPhoto)
        } catch (error) {
          console.error('Failed to upload staff photo:', error)
          photoUploadError =
            error instanceof Error
              ? `${error.message} The staff details were saved without updating the photo.`
              : 'The staff details were saved without updating the photo.'
        }
      }

      handleOpenChange(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.staff.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.staff.detail(profile.id) }),
      ])
      onSuccess?.()

      if (photoUploadError) {
        toast({
          title: 'Photo upload failed',
          description: photoUploadError,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Staff updated',
          description: `${updatedProfile.name} was updated successfully.`,
        })
      }
    } catch (error) {
      console.error('Failed to update staff:', error)
      toast({
        title: 'Staff update failed',
        description: error instanceof Error ? error.message : 'Failed to update staff.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Staff</DialogTitle>
          <DialogDescription>
            Update the editable staff profile fields below. Email addresses and passwords remain locked after account creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <StaffFormFields
            idPrefix="edit-staff"
            mode="edit"
            formData={formData}
            setFormData={setFormData}
            setPhotoFile={setPhotoFile}
            isSubmitting={isSubmitting}
            defaultPhotoUrl={profile.photoUrl}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.name.trim() || !formData.title || !hasChanges}
            >
              {isSubmitting ? 'Saving Changes...' : (
                <>
                  <Pencil className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
