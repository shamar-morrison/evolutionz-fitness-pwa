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
import {
  formatStaffTitles,
  hasStaffTitle,
  isEditableStaffGender,
  normalizeTrainerSpecialties,
} from '@/lib/staff'
import { addStaffTitles, createStaff, uploadStaffPhoto } from '@/lib/staff-actions'
import {
  StaffAdditionalInfoFields,
  StaffIdentityFields,
  StaffPhotoField,
  StaffTitlesFields,
  createEmptyStaffFormState,
} from '@/components/staff-form-fields'
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
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [duplicateProfile, setDuplicateProfile] = useState<{
    id: string
    name: string
    titles: string[]
  } | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormData(createEmptyStaffFormState())
      setPhotoFile(null)
      setIsSubmitting(false)
      setStep(1)
      setDuplicateProfile(null)
    }

    onOpenChange(nextOpen)
  }

  const validateIdentityStep = () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Full name required',
        description: 'Enter the staff member’s full name before saving.',
        variant: 'destructive',
      })
      return false
    }

    if (!emailSchema.safeParse(formData.email).success) {
      toast({
        title: 'Invalid email',
        description: 'Enter a valid email address.',
        variant: 'destructive',
      })
      return false
    }

    if (formData.password.length < 8) {
      toast({
        title: 'Password too short',
        description: 'Passwords must be at least 8 characters long.',
        variant: 'destructive',
      })
      return false
    }

    return true
  }

  const validateTitlesStep = () => {
    if (formData.titles.length === 0) {
      toast({
        title: 'Title required',
        description: 'Choose at least one title before continuing.',
        variant: 'destructive',
      })
      return false
    }

    return true
  }

  const handleNextStep = () => {
    if (step === 1) {
      if (!validateIdentityStep()) {
        return
      }

      setStep(2)
      return
    }

    if (step === 2) {
      if (!validateTitlesStep()) {
        return
      }

      setStep(3)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!validateIdentityStep() || !validateTitlesStep()) {
      return
    }

    setIsSubmitting(true)

    try {
      const result = await createStaff({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        ...(formData.phone.trim() ? { phone: formData.phone.trim() } : {}),
        ...(isEditableStaffGender(formData.gender) ? { gender: formData.gender } : {}),
        ...(formData.remark.trim() ? { remark: formData.remark.trim() } : {}),
        titles: formData.titles,
        ...(hasStaffTitle(formData.titles, 'Trainer')
          ? { specialties: normalizeTrainerSpecialties(formData.specialties) }
          : {}),
      })

      if (!result.ok) {
        setDuplicateProfile(result.existingProfile)
        return
      }

      const profile = result.profile

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
          description: `${profile.name} was added as ${formatStaffTitles(profile.titles) || 'Staff'}.`,
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

  const handleConfirmDuplicate = async () => {
    if (!duplicateProfile) {
      return
    }

    setIsSubmitting(true)

    try {
      const profile = await addStaffTitles(duplicateProfile.id, {
        titles: formData.titles,
        ...(hasStaffTitle(formData.titles, 'Trainer')
          ? { specialties: normalizeTrainerSpecialties(formData.specialties) }
          : {}),
      })

      handleOpenChange(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.staff.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.staff.detail(duplicateProfile.id) }),
      ])
      onSuccess?.(profile)

      toast({
        title: 'Staff updated',
        description: `${profile.name} now has ${formatStaffTitles(profile.titles) || 'staff access'}.`,
      })
    } catch (error) {
      console.error('Failed to merge staff titles:', error)
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
          <p className="text-sm font-medium text-muted-foreground">
            {duplicateProfile ? 'Confirmation required' : `Step ${step} of 3`}
          </p>
          <DialogTitle>{duplicateProfile ? 'Existing Staff Account Found' : 'Add Staff'}</DialogTitle>
          <DialogDescription>
            {duplicateProfile
              ? 'Choose whether to add the selected titles to the existing account.'
              : 'Create a new staff login and staff profile. Names, email addresses, and passwords are not editable after creation.'}
          </DialogDescription>
        </DialogHeader>

        {duplicateProfile ? (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p>
                A staff member with this email already exists: <span className="font-medium text-foreground">
                  {duplicateProfile.name}
                </span>{' '}
                ({formatStaffTitles(duplicateProfile.titles) || 'No titles assigned'}).
              </p>
              <p className="mt-3">
                Would you like to add{' '}
                <span className="font-medium text-foreground">
                  {formatStaffTitles(formData.titles) || 'the selected titles'}
                </span>{' '}
                to their account?
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDuplicateProfile(null)
                  setStep(1)
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleConfirmDuplicate()} disabled={isSubmitting}>
                {isSubmitting ? 'Updating Staff...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 ? (
              <div className="space-y-4">
                <StaffIdentityFields
                  idPrefix="staff"
                  mode="add"
                  formData={formData}
                  setFormData={setFormData}
                  isSubmitting={isSubmitting}
                  resetPasswordVisibilityKey={open}
                />
                <div className="h-px bg-border" />
                <StaffPhotoField setPhotoFile={setPhotoFile} />
              </div>
            ) : null}

            {step === 2 ? (
              <StaffTitlesFields
                formData={formData}
                setFormData={setFormData}
                isSubmitting={isSubmitting}
              />
            ) : null}

            {step === 3 ? (
              <StaffAdditionalInfoFields
                idPrefix="staff"
                formData={formData}
                setFormData={setFormData}
                isSubmitting={isSubmitting}
              />
            ) : null}

            <DialogFooter>
              {step === 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((currentStep) => (currentStep === 3 ? 2 : 1))}
                  disabled={isSubmitting}
                >
                  Back
                </Button>
              )}

              {step < 3 ? (
                <Button
                  key="next-step-button"
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    handleNextStep()
                  }}
                  disabled={isSubmitting}
                >
                  Next
                </Button>
              ) : (
                <Button key="save-staff-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating Staff...' : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Save Staff
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
