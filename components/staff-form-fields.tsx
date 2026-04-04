'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { Pattern } from '@/components/ui/file-upload'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
  isEditableStaffGender,
  normalizeTrainerSpecialties,
  STAFF_TITLES,
  TRAINER_SPECIALTIES,
  shouldShowOwnerWarning,
  type StaffTitle,
  type TrainerSpecialty,
} from '@/lib/staff'
import type { StaffGender } from '@/types'

export const MASKED_PASSWORD_VALUE = '••••••••'

export type StaffFormState = {
  name: string
  email: string
  password: string
  confirmPassword: string
  phone: string
  gender: StaffGender | ''
  remark: string
  title: StaffTitle | ''
  specialties: TrainerSpecialty[]
}

type StaffFormFieldsProps = {
  defaultPhotoUrl?: string | null
  idPrefix: string
  isSubmitting: boolean
  mode: 'add' | 'edit'
  formData: StaffFormState
  setFormData: Dispatch<SetStateAction<StaffFormState>>
  setPhotoFile: (file: FileWithPreview | null) => void
  resetPasswordVisibilityKey?: boolean | number | string
}

function ImmutableFieldHint() {
  return <p className="text-xs text-muted-foreground">Not editable</p>
}

export function createEmptyStaffFormState(): StaffFormState {
  return {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    gender: '',
    remark: '',
    title: '',
    specialties: [],
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
  resetPasswordVisibilityKey,
}: StaffFormFieldsProps) {
  const isEditMode = mode === 'edit'
  const disabledFieldClassName = 'bg-muted/30 text-muted-foreground'
  const selectedGender = isEditableStaffGender(formData.gender) ? formData.gender : ''
  const selectedSpecialties = normalizeTrainerSpecialties(formData.specialties)
  const isTrainerTitle = formData.title === 'Trainer'
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    setShowPassword(false)
    setShowConfirmPassword(false)
  }, [mode, resetPasswordVisibilityKey])

  return (
    <div className="grid gap-4 py-2">
      {/* Row 1: Full Name — full width */}
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

      <div className="h-px bg-border" />

      {/* Row 2: Title & Gender — 2 cols */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-title`}>Title</Label>
          <Select
            value={formData.title}
            onValueChange={(value: StaffTitle) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                title: value,
                specialties:
                  value === 'Trainer'
                    ? normalizeTrainerSpecialties(currentFormData.specialties)
                    : [],
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
          <Label>Gender</Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { label: 'Male', value: 'male' },
              { label: 'Female', value: 'female' },
            ] as const).map((gender) => (
              <Button
                key={gender.value}
                type="button"
                variant={selectedGender === gender.value ? 'default' : 'outline'}
                onClick={() =>
                  setFormData((currentFormData) => ({
                    ...currentFormData,
                    gender: currentFormData.gender === gender.value ? '' : gender.value,
                  }))
                }
                disabled={isSubmitting}
              >
                {gender.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isTrainerTitle ? (
        <div className="grid gap-2">
          <Label>Specialties</Label>
          <div className="flex flex-wrap gap-2">
            {TRAINER_SPECIALTIES.map((specialty) => {
              const isSelected = selectedSpecialties.includes(specialty)

              return (
                <Button
                  key={specialty}
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  className="h-auto min-h-10 justify-start whitespace-normal px-3 py-2 text-left leading-snug"
                  onClick={() =>
                    setFormData((currentFormData) => {
                      const currentSpecialties = normalizeTrainerSpecialties(
                        currentFormData.specialties,
                      )

                      return {
                        ...currentFormData,
                        specialties: currentSpecialties.includes(specialty)
                          ? currentSpecialties.filter((value) => value !== specialty)
                          : normalizeTrainerSpecialties([
                              ...currentSpecialties,
                              specialty,
                            ]),
                      }
                    })
                  }
                  disabled={isSubmitting}
                >
                  {specialty}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="h-px bg-border" />

      {/* Row 3: Email & Phone — 2 cols */}
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
      </div>

      <div className="h-px bg-border" />

      {/* Row 4: Password & Confirm Password */}
      <div className={isEditMode ? "grid gap-2" : "grid gap-4 sm:grid-cols-2"}>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-password`}>Password</Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-password`}
              type={isEditMode ? 'text' : showPassword ? 'text' : 'password'}
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
              autoComplete={isEditMode ? undefined : 'new-password'}
              className={isEditMode ? disabledFieldClassName : 'pr-12'}
            />
            {!isEditMode ? (
              <button
                type="button"
                onClick={() => setShowPassword((currentValue) => !currentValue)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
                disabled={isSubmitting}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            ) : null}
          </div>
          {isEditMode ? <ImmutableFieldHint /> : null}
        </div>

        {!isEditMode ? (
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-confirm-password`}>Confirm Password</Label>
            <div className="relative">
              <Input
                id={`${idPrefix}-confirm-password`}
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(event) =>
                  setFormData((currentFormData) => ({
                    ...currentFormData,
                    confirmPassword: event.target.value,
                  }))
                }
                placeholder="Re-enter password"
                minLength={8}
                required
                autoComplete="new-password"
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((currentValue) => !currentValue)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
                disabled={isSubmitting}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="h-px bg-border" />

      {/* Row 5: Avatar — centered */}
      <div className="flex justify-center py-2">
        <Pattern onFileChange={setPhotoFile} defaultAvatar={defaultPhotoUrl ?? undefined} />
      </div>

      <div className="h-px bg-border" />

      {/* Row 6: Remark — full width */}
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
