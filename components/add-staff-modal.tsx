'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { toast } from '@/hooks/use-toast'
import { compressImage } from '@/lib/compress-image'
import { queryKeys } from '@/lib/query-keys'
import { isEditableStaffGender, normalizeTrainerSpecialties } from '@/lib/staff'
import { createStaff, uploadStaffPhoto } from '@/lib/staff-actions'
import { StaffFormFields, createEmptyStaffFormState } from '@/components/staff-form-fields'
import type { Profile } from '@/types'

type AddStaffModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (profile: Profile) => void
}

const emailSchema = z.string().trim().email('Enter a valid email address.')

export { OwnerTitleWarning } from '@/components/staff-form-fields'

export function AddStaffModal({ open, onOpenChange, onSuccess }: AddStaffModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState(() => createEmptyStaffFormState())
  const [photoFile, setPhotoFile] = useState<FileWithPreview | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormData(createEmptyStaffFormState())
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

    if (!emailSchema.safeParse(formData.email).success) {
      toast({
        title: 'Invalid email',
        description: 'Enter a valid email address.',
        variant: 'destructive',
      })
      return
    }

    if (formData.password.length < 8) {
      toast({
        title: 'Password too short',
        description: 'Passwords must be at least 8 characters long.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.title) {
      toast({
        title: 'Title required',
        description: 'Choose a title before creating this staff account.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const profile = await createStaff({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        ...(formData.phone.trim() ? { phone: formData.phone.trim() } : {}),
        ...(isEditableStaffGender(formData.gender) ? { gender: formData.gender } : {}),
        ...(formData.remark.trim() ? { remark: formData.remark.trim() } : {}),
        title: formData.title,
        ...(formData.title === 'Trainer'
          ? { specialties: normalizeTrainerSpecialties(formData.specialties) }
          : {}),
      })

      let photoUploadError: string | null = null

      if (photoFile) {
        try {
          const compressedPhoto = await compressImage(photoFile.file)
          await uploadStaffPhoto(profile.id, compressedPhoto)
        } catch (error) {
          console.error('Failed to upload staff photo:', error)
          photoUploadError =
            error instanceof Error
              ? `${error.message} The staff account was created without a photo.`
              : 'The staff account was created without a photo.'
        }
      }

      handleOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.staff.all })
      onSuccess?.(profile)

      if (photoUploadError) {
        toast({
          title: 'Photo upload failed',
          description: photoUploadError,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Staff added',
          description: `${profile.name} was added as ${profile.title ?? 'Staff'}.`,
        })
      }
    } catch (error) {
      console.error('Failed to create staff:', error)
      toast({
        title: 'Staff creation failed',
        description: error instanceof Error ? error.message : 'Failed to create staff.',
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
          <DialogTitle>Add Staff</DialogTitle>
          <DialogDescription>
            Create a new staff login and staff profile. Names, email addresses, and passwords are not editable after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <StaffFormFields
            idPrefix="staff"
            mode="add"
            formData={formData}
            setFormData={setFormData}
            setPhotoFile={setPhotoFile}
            isSubmitting={isSubmitting}
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
              disabled={
                isSubmitting ||
                !formData.name.trim() ||
                !formData.email.trim() ||
                formData.password.length < 8 ||
                !formData.title
              }
            >
              {isSubmitting ? 'Creating Staff...' : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Save Staff
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
