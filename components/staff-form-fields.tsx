'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { Pattern } from '@/components/ui/file-upload'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { FileWithPreview } from '@/hooks/use-file-upload'
import {
  hasStaffTitle,
  isEditableStaffGender,
  normalizeStaffTitles,
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
  titles: StaffTitle[]
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

type SharedStaffFormProps = Pick<
  StaffFormFieldsProps,
  'formData' | 'idPrefix' | 'isSubmitting' | 'mode' | 'setFormData'
>

function ImmutableFieldHint() {
  return <p className="text-xs text-muted-foreground">Not editable</p>
}

function getNextTitles(currentTitles: StaffTitle[], title: StaffTitle) {
  if (currentTitles.includes(title)) {
    return currentTitles.filter((currentTitle) => currentTitle !== title)
  }

  return normalizeStaffTitles([...currentTitles, title])
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
    titles: [],
    specialties: [],
  }
}

export function OwnerTitleWarning({
  titles,
}: {
  titles: ReadonlyArray<StaffTitle>
}) {
  if (!shouldShowOwnerWarning(titles)) {
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

export function StaffIdentityFields({
  formData,
  idPrefix,
  isSubmitting,
  mode,
  setFormData,
  resetPasswordVisibilityKey,
}: SharedStaffFormProps & {
  resetPasswordVisibilityKey?: boolean | number | string
}) {
  const isEditMode = mode === 'edit'
  const disabledFieldClassName = 'bg-muted/30 text-muted-foreground'
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    setShowPassword(false)
  }, [mode, resetPasswordVisibilityKey])

  return (
    <div className="grid gap-4">
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
          disabled={isSubmitting}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor={`${idPrefix}-email`}>Email</Label>
          {isEditMode ? <ImmutableFieldHint /> : null}
        </div>
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
          placeholder={isEditMode ? 'Not editable' : 'Enter email address'}
          required={!isEditMode}
          disabled={isEditMode || isSubmitting}
          className={isEditMode ? disabledFieldClassName : undefined}
        />
      </div>

      <div className={isEditMode ? "grid gap-2" : "grid sm:grid-cols-2 gap-4"}>
        <div className="grid gap-2">
          <div className="flex items-baseline gap-2">
            <Label htmlFor={`${idPrefix}-password`}>Password</Label>
            {isEditMode ? <ImmutableFieldHint /> : null}
          </div>
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
              disabled={isEditMode || isSubmitting}
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
        </div>

        {!isEditMode ? (
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-confirm-password`}>Confirm Password</Label>
            <Input
              id={`${idPrefix}-confirm-password`}
              type={showPassword ? 'text' : 'password'}
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
              disabled={isSubmitting}
              autoComplete="new-password"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function StaffTitlesFields({
  formData,
  isSubmitting,
  setFormData,
}: Pick<SharedStaffFormProps, 'formData' | 'isSubmitting' | 'setFormData'>) {
  const selectedTitles = normalizeStaffTitles(formData.titles)
  const selectedSpecialties = normalizeTrainerSpecialties(formData.specialties)
  const isTrainer = hasStaffTitle(selectedTitles, 'Trainer')

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Titles</Label>
        <div className="flex flex-wrap gap-2">
          {STAFF_TITLES.map((title) => {
            const isSelected = selectedTitles.includes(title)

            return (
              <Button
                key={title}
                type="button"
                variant={isSelected ? 'default' : 'outline'}
                className="h-auto min-h-10 justify-start whitespace-normal px-3 py-2 text-left leading-snug"
                onClick={() =>
                  setFormData((currentFormData) => {
                    const titles = getNextTitles(currentFormData.titles, title)

                    return {
                      ...currentFormData,
                      titles,
                      specialties: hasStaffTitle(titles, 'Trainer')
                        ? normalizeTrainerSpecialties(currentFormData.specialties)
                        : [],
                    }
                  })
                }
                disabled={isSubmitting}
              >
                {title}
              </Button>
            )
          })}
        </div>
        <OwnerTitleWarning titles={selectedTitles} />
      </div>

      {isTrainer ? (
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
    </div>
  )
}

export function StaffAdditionalInfoFields({
  formData,
  idPrefix,
  isSubmitting,
  setFormData,
}: Pick<SharedStaffFormProps, 'formData' | 'idPrefix' | 'isSubmitting' | 'setFormData'>) {
  const selectedGender = isEditableStaffGender(formData.gender) ? formData.gender : ''

  return (
    <div className="grid gap-4">
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
          disabled={isSubmitting}
        />
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
          disabled={isSubmitting}
        />
      </div>
    </div>
  )
}

export function StaffPhotoField({
  defaultPhotoUrl,
  setPhotoFile,
}: Pick<StaffFormFieldsProps, 'defaultPhotoUrl' | 'setPhotoFile'>) {
  return (
    <div className="flex justify-center py-2">
      <Pattern onFileChange={setPhotoFile} defaultAvatar={defaultPhotoUrl ?? undefined} />
    </div>
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
  return (
    <div className="grid gap-4 py-2">
      <StaffIdentityFields
        idPrefix={idPrefix}
        mode={mode}
        formData={formData}
        setFormData={setFormData}
        isSubmitting={isSubmitting}
        resetPasswordVisibilityKey={resetPasswordVisibilityKey}
      />

      <div className="h-px bg-border" />

      <StaffTitlesFields
        formData={formData}
        setFormData={setFormData}
        isSubmitting={isSubmitting}
      />

      <div className="h-px bg-border" />

      <StaffAdditionalInfoFields
        idPrefix={idPrefix}
        formData={formData}
        setFormData={setFormData}
        isSubmitting={isSubmitting}
      />

      <div className="h-px bg-border" />

      <StaffPhotoField defaultPhotoUrl={defaultPhotoUrl} setPhotoFile={setPhotoFile} />
    </div>
  )
}
