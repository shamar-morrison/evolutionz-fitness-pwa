'use client'

import type { Dispatch, SetStateAction } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Pattern } from '@/components/ui/file-upload'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  STAFF_TITLES,
  shouldShowOwnerWarning,
  type StaffTitle,
} from '@/lib/staff'
import type { StaffGender } from '@/types'

export const MASKED_PASSWORD_VALUE = '••••••••'

export type StaffFormState = {
  name: string
  email: string
  password: string
  phone: string
  gender: StaffGender | ''
  remark: string
  title: StaffTitle | ''
}

type StaffFormFieldsProps = {
  defaultPhotoUrl?: string | null
  idPrefix: string
  isSubmitting: boolean
  mode: 'add' | 'edit'
  formData: StaffFormState
  setFormData: Dispatch<SetStateAction<StaffFormState>>
  setPhotoFile: (file: FileWithPreview | null) => void
}

function ImmutableFieldHint() {
  return <p className="text-xs text-muted-foreground">Not editable</p>
}

export function createEmptyStaffFormState(): StaffFormState {
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

export function StaffFormFields({
  defaultPhotoUrl,
  idPrefix,
  isSubmitting,
  mode,
  formData,
  setFormData,
  setPhotoFile,
}: StaffFormFieldsProps) {
  const isEditMode = mode === 'edit'
  const disabledFieldClassName = 'bg-muted/30 text-muted-foreground'

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Full Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={formData.name}
          onChange={(event) =>
            setFormData((currentFormData) => ({
              ...currentFormData,
              name: event.target.value,
            }))
          }
          placeholder="Enter full name"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-email`}>Email</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={formData.email}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                email: event.target.value,
              }))
            }
            placeholder="Not editable"
            required={!isEditMode}
            disabled={isEditMode}
            className={isEditMode ? disabledFieldClassName : undefined}
          />
          {isEditMode ? <ImmutableFieldHint /> : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-password`}>Password</Label>
          <Input
            id={`${idPrefix}-password`}
            type={isEditMode ? 'text' : 'password'}
            value={formData.password}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                password: event.target.value,
              }))
            }
            placeholder={isEditMode ? 'Not editable' : 'Minimum 8 characters'}
            minLength={isEditMode ? undefined : 8}
            required={!isEditMode}
            disabled={isEditMode}
            className={isEditMode ? disabledFieldClassName : undefined}
          />
          {isEditMode ? <ImmutableFieldHint /> : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-phone`}>Telephone Number</Label>
          <Input
            id={`${idPrefix}-phone`}
            value={formData.phone}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                phone: event.target.value,
              }))
            }
            placeholder="Optional phone number"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-gender`}>Gender</Label>
          <Select
            value={formData.gender}
            onValueChange={(value: StaffGender) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                gender: value,
              }))
            }
            disabled={isSubmitting}
          >
            <SelectTrigger id={`${idPrefix}-gender`}>
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
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Select
          value={formData.title}
          onValueChange={(value: StaffTitle) =>
            setFormData((currentFormData) => ({
              ...currentFormData,
              title: value,
            }))
          }
          disabled={isSubmitting}
        >
          <SelectTrigger id={`${idPrefix}-title`}>
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
          <Pattern onFileChange={setPhotoFile} defaultAvatar={defaultPhotoUrl ?? undefined} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-remark`}>Remark</Label>
        <Textarea
          id={`${idPrefix}-remark`}
          rows={3}
          value={formData.remark}
          onChange={(event) =>
            setFormData((currentFormData) => ({
              ...currentFormData,
              remark: event.target.value,
            }))
          }
          placeholder="Optional notes about this staff member..."
          className="resize-none"
        />
      </div>
    </div>
  )
}
