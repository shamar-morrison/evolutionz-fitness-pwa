'use client'

import type { ClassRegistrationFeeType } from '@/types'
import {
  CLASS_REGISTRATION_FEE_OPTIONS,
  calculateClassRegistrationAmount,
  formatOptionalJmd,
} from '@/lib/classes'
import type { ClassWithTrainers } from '@/lib/classes'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'

function isPresetFeeTypeAvailable(
  classItem: Pick<ClassWithTrainers, 'monthly_fee' | 'per_session_fee'>,
  feeType: Exclude<ClassRegistrationFeeType, 'custom'>,
) {
  return feeType === 'monthly'
    ? typeof classItem.monthly_fee === 'number'
    : typeof classItem.per_session_fee === 'number'
}

export function ClassRegistrationFeeFields({
  classItem,
  feeType,
  customAmount,
  paymentReceived,
  notes,
  onFeeTypeChange,
  onCustomAmountChange,
  onPaymentReceivedChange,
  onNotesChange,
}: {
  classItem: Pick<ClassWithTrainers, 'monthly_fee' | 'per_session_fee'>
  feeType: ClassRegistrationFeeType
  customAmount: string
  paymentReceived: boolean
  notes: string
  onFeeTypeChange: (value: ClassRegistrationFeeType) => void
  onCustomAmountChange: (value: string) => void
  onPaymentReceivedChange: (value: boolean) => void
  onNotesChange: (value: string) => void
}) {
  const parsedCustomAmount = Number(customAmount)
  const calculatedAmount = calculateClassRegistrationAmount({
    classItem,
    fee_type: feeType,
    custom_amount: Number.isFinite(parsedCustomAmount) ? parsedCustomAmount : 0,
  })
  const effectiveAmountPaid = paymentReceived ? calculatedAmount : 0

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label>Fee type</Label>
        <RadioGroup
          value={feeType}
          onValueChange={(value) => onFeeTypeChange(value as ClassRegistrationFeeType)}
          className="grid gap-3"
        >
          {CLASS_REGISTRATION_FEE_OPTIONS.map((option) => {
            const isAvailable =
              option.value === 'custom'
                ? true
                : isPresetFeeTypeAvailable(classItem, option.value)
            const amount =
              option.value === 'custom'
                ? 'Enter any whole-number JMD amount.'
                : isAvailable
                  ? formatOptionalJmd(
                      calculateClassRegistrationAmount({
                        classItem,
                        fee_type: option.value,
                      }),
                    )
                  : 'Not configured'

            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                  isAvailable ? '' : 'cursor-not-allowed opacity-60'
                }`}
              >
                <RadioGroupItem
                  value={option.value}
                  id={`class-fee-${option.value}`}
                  disabled={!isAvailable}
                />
                <div className="space-y-1">
                  <p className="font-medium">{option.label}</p>
                  <p className="text-sm text-muted-foreground">{amount}</p>
                </div>
              </label>
            )
          })}
        </RadioGroup>
      </div>

      {feeType === 'custom' ? (
        <div className="space-y-2">
          <Label htmlFor="class-custom-fee">Custom class fee (JMD)</Label>
          <Input
            id="class-custom-fee"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={customAmount}
            onChange={(event) => onCustomAmountChange(event.target.value)}
            placeholder="Enter a whole-number JMD amount"
          />
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Calculated amount</p>
            <p className="text-2xl font-semibold">{formatOptionalJmd(calculatedAmount)}</p>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-lg border p-4">
        <Checkbox
          checked={paymentReceived}
          onCheckedChange={(checked) => onPaymentReceivedChange(checked === true)}
        />
        <div>
          <p className="font-medium">Payment received</p>
          <p className="text-sm text-muted-foreground">
            Uncheck this to save the registration with {formatOptionalJmd(0)} paid.
          </p>
        </div>
      </label>

      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {paymentReceived
          ? `The registration will be saved with ${formatOptionalJmd(effectiveAmountPaid)} paid.`
          : 'The registration will be saved with 0 JMD paid until payment is collected.'}
      </div>

      <div className="space-y-2">
        <Label htmlFor="class-registration-notes">Notes</Label>
        <Textarea
          id="class-registration-notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Optional notes to include on the receipt"
        />
      </div>
    </div>
  )
}
