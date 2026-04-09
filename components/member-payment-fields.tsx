'use client'

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
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
import {
  formatPaymentAmountInputValue,
  getDefaultMemberPaymentDate,
  getMemberTypeMonthlyRate,
  MEMBER_PAYMENT_METHOD_OPTIONS,
} from '@/lib/member-payments'
import type { MemberPaymentMethod, MemberTypeRecord } from '@/types'

export type MemberPaymentFormState = {
  memberTypeId: string
  amount: string
  paymentMethod: MemberPaymentMethod | ''
  promotion: string
  paymentDate: string
  notes: string
}

export function createInitialMemberPaymentFormState(
  memberTypeId: string,
  memberTypes: MemberTypeRecord[],
  now: Date = new Date(),
): MemberPaymentFormState {
  const monthlyRate = memberTypeId
    ? getMemberTypeMonthlyRate(memberTypes, memberTypeId)
    : null

  return {
    memberTypeId,
    amount: monthlyRate === null ? '' : formatPaymentAmountInputValue(monthlyRate),
    paymentMethod: '',
    promotion: '',
    paymentDate: getDefaultMemberPaymentDate(now),
    notes: '',
  }
}

type MemberPaymentFieldsProps = {
  amountDirty: boolean
  disabled?: boolean
  formData: MemberPaymentFormState
  idPrefix: string
  isMemberTypesLoading?: boolean
  memberTypes: MemberTypeRecord[]
  memberTypesError?: string | null
  setAmountDirty: Dispatch<SetStateAction<boolean>>
  setFormData: Dispatch<SetStateAction<MemberPaymentFormState>>
}

const EMPTY_MEMBER_TYPE_VALUE = '__none__'
const EMPTY_PAYMENT_METHOD_VALUE = '__none__'

export function MemberPaymentFields({
  amountDirty,
  disabled = false,
  formData,
  idPrefix,
  isMemberTypesLoading = false,
  memberTypes,
  memberTypesError = null,
  setAmountDirty,
  setFormData,
}: MemberPaymentFieldsProps) {
  const previousMemberTypeIdRef = useRef(formData.memberTypeId)

  useEffect(() => {
    if (amountDirty) {
      return
    }

    const memberTypeChanged = previousMemberTypeIdRef.current !== formData.memberTypeId
    const needsInitialAutoFill = Boolean(formData.memberTypeId) && !formData.amount

    if (!memberTypeChanged && !needsInitialAutoFill) {
      return
    }

    previousMemberTypeIdRef.current = formData.memberTypeId

    const monthlyRate = formData.memberTypeId
      ? getMemberTypeMonthlyRate(memberTypes, formData.memberTypeId)
      : null

    setFormData((currentFormData) => ({
      ...currentFormData,
      amount: monthlyRate === null ? '' : formatPaymentAmountInputValue(monthlyRate),
    }))
  }, [amountDirty, formData.memberTypeId, memberTypes, setFormData])

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-member-type`}>Membership Type</Label>
          <Select
            value={formData.memberTypeId || EMPTY_MEMBER_TYPE_VALUE}
            onValueChange={(value) => {
              setFormData((currentFormData) => ({
                ...currentFormData,
                memberTypeId: value === EMPTY_MEMBER_TYPE_VALUE ? '' : value,
              }))
            }}
            disabled={disabled || isMemberTypesLoading}
          >
            <SelectTrigger id={`${idPrefix}-member-type`}>
              <SelectValue
                placeholder={isMemberTypesLoading ? 'Loading membership types...' : 'Select type'}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_MEMBER_TYPE_VALUE}>Select type</SelectItem>
              {memberTypes.map((memberType) => (
                <SelectItem key={memberType.id} value={memberType.id}>
                  {memberType.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {memberTypesError ? (
            <p className="text-xs text-destructive">{memberTypesError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Changing the membership type auto-fills the amount until it is edited manually.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-amount`}>Amount</Label>
          <Input
            id={`${idPrefix}-amount`}
            type="number"
            min={0}
            step="0.01"
            value={formData.amount}
            onChange={(event) => {
              setAmountDirty(true)
              setFormData((currentFormData) => ({
                ...currentFormData,
                amount: event.target.value,
              }))
            }}
            disabled={disabled}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-payment-method`}>Payment Method</Label>
          <Select
            value={formData.paymentMethod || EMPTY_PAYMENT_METHOD_VALUE}
            onValueChange={(value) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                paymentMethod:
                  value === EMPTY_PAYMENT_METHOD_VALUE ? '' : (value as MemberPaymentMethod),
              }))
            }
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-payment-method`}>
              <SelectValue placeholder="Select payment method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_PAYMENT_METHOD_VALUE}>Select payment method</SelectItem>
              {MEMBER_PAYMENT_METHOD_OPTIONS.map((paymentMethod) => (
                <SelectItem key={paymentMethod.value} value={paymentMethod.value}>
                  {paymentMethod.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-payment-date`}>Payment Date</Label>
          <Input
            id={`${idPrefix}-payment-date`}
            type="date"
            value={formData.paymentDate}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                paymentDate: event.target.value,
              }))
            }
            disabled={disabled}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-promotion`}>Promotion (optional)</Label>
          <Input
            id={`${idPrefix}-promotion`}
            value={formData.promotion}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                promotion: event.target.value,
              }))
            }
            disabled={disabled}
            placeholder="Optional promotion"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
          <Textarea
            id={`${idPrefix}-notes`}
            rows={3}
            value={formData.notes}
            onChange={(event) =>
              setFormData((currentFormData) => ({
                ...currentFormData,
                notes: event.target.value,
              }))
            }
            disabled={disabled}
            placeholder="Optional notes"
            className="resize-none"
          />
        </div>
      </div>
    </div>
  )
}
