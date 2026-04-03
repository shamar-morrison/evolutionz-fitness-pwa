'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { AlertTriangle, UserPlus } from 'lucide-react'
import { Pattern } from '@/components/ui/file-upload'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import { toast } from '@/hooks/use-toast'
import { compressImage } from '@/lib/compress-image'
import { queryKeys } from '@/lib/query-keys'
import {
  STAFF_TITLES,
  shouldShowOwnerWarning,
  type StaffTitle,
} from '@/lib/staff'
import { createStaff, uploadStaffPhoto } from '@/lib/staff-actions'
import type { Profile, StaffGender } from '@/types'

type AddStaffModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (profile: Profile) => void
}

type AddStaffFormState = {
  name: string
  email: string
  password: string
  phone: string
  gender: StaffGender | ''
  remark: string
  title: StaffTitle | ''
}

const emailSchema = z.string().trim().email('Enter a valid email address.')

function createInitialFormState(): AddStaffFormState {
  return {
    name: '',
    email: '',
    password: '',
    phone: '',
    gender: '',
    remark: '',
    title: '',
  }
}

export function OwnerTitleWarning({ title }: { title: StaffTitle | '' }) {
  if (!shouldShowOwnerWarning(title)) {
    return null
  }

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900">
      <AlertTriangle className="text-amber-700" />
      <AlertDescription className="text-amber-900">
        This title grants full admin access to the entire app.
      </AlertDescription>
    </Alert>
  )
}

export function AddStaffModal({ open, onOpenChange, onSuccess }: AddStaffModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<AddStaffFormState>(() => createInitialFormState())
  const [photoFile, setPhotoFile] = useState<FileWithPreview | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFormData(createInitialFormState())
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
        ...(formData.gender ? { gender: formData.gender } : {}),
        ...(formData.remark.trim() ? { remark: formData.remark.trim() } : {}),
        title: formData.title,
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
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="staff-name">Full Name</Label>
              <Input
                id="staff-name"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Enter full name"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={formData.email}
                  onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                  placeholder="staff@evolutionzfitness.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="staff-password">Password</Label>
                <Input
                  id="staff-password"
                  type="password"
                  value={formData.password}
                  onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="staff-phone">Telephone Number</Label>
                <Input
                  id="staff-phone"
                  value={formData.phone}
                  onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                  placeholder="Optional phone number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="staff-gender">Gender</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value: StaffGender) => setFormData({ ...formData, gender: value })}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="staff-gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="staff-title">Title</Label>
              <Select
                value={formData.title}
                onValueChange={(value: StaffTitle) => setFormData({ ...formData, title: value })}
                disabled={isSubmitting}
              >
              <SelectTrigger id="staff-title">
                <SelectValue placeholder="Select title" />
              </SelectTrigger>
              <SelectContent>
                  {STAFF_TITLES.map((title) => (
                    <SelectItem key={title} value={title}>
                      {title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <OwnerTitleWarning title={formData.title} />
            </div>

            <div className="grid gap-2">
              <Label>Photo Upload</Label>
              <div className="rounded-xl border border-dashed px-4 py-5">
                <Pattern onFileChange={setPhotoFile} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="staff-remark">Remark</Label>
              <Textarea
                id="staff-remark"
                rows={3}
                value={formData.remark}
                onChange={(event) => setFormData({ ...formData, remark: event.target.value })}
                placeholder="Optional notes about this staff member..."
                className="resize-none"
              />
            </div>
          </div>

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
