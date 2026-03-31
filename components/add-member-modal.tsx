'use client'

import { useEffect, useMemo, useState } from 'react'
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
import {
  addMember,
  MemberProvisioningError,
  type AddMemberData,
  type MemberCardSource,
} from '@/lib/member-actions'
import { getManualCardNoValidationError, normalizeCardNo } from '@/lib/card-no'
import { useAvailableCards } from '@/hooks/use-available-cards'
import {
  formatAvailableAccessCardLabel,
} from '@/lib/available-cards'
import { toast } from '@/hooks/use-toast'
import type { AvailableAccessCard, Member, MemberType } from '@/types'

type AddMemberModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (member: Member) => void
}

type AddMemberFormState = {
  name: string
  cardSource: MemberCardSource
  selectedInventoryCardNo: string
  manualCardNo: string
  type: MemberType
  expiry: string
}

const memberTypes: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']

const initialFormState: AddMemberFormState = {
  name: '',
  cardSource: 'inventory',
  selectedInventoryCardNo: '',
  manualCardNo: '',
  type: 'General',
  expiry: '',
}

export function AddMemberModal({ open, onOpenChange, onSuccess }: AddMemberModalProps) {
  const [submissionStep, setSubmissionStep] = useState<'idle' | 'provisioning_member'>('idle')
  const [formData, setFormData] = useState<AddMemberFormState>(initialFormState)
  const {
    cards: availableCards,
    isLoading: isCardsLoading,
    error: cardsError,
    refetch: refetchAvailableCards,
  } = useAvailableCards({ enabled: open })

  const isSubmitting = submissionStep !== 'idle'
  const hasNoAvailableCards = !isCardsLoading && availableCards.length === 0 && !cardsError
  const selectedInventoryCard = useMemo(
    () =>
      availableCards.find((card) => card.cardNo === formData.selectedInventoryCardNo) ?? null,
    [availableCards, formData.selectedInventoryCardNo],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    setFormData((currentFormData) => ({
      ...currentFormData,
      selectedInventoryCardNo: availableCards.some(
        (card) => card.cardNo === currentFormData.selectedInventoryCardNo,
      )
        ? currentFormData.selectedInventoryCardNo
        : availableCards[0]?.cardNo ?? '',
    }))
  }, [availableCards, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const normalizedManualCardNo = normalizeCardNo(formData.manualCardNo)
    const selectedCardNo =
      formData.cardSource === 'manual'
        ? normalizedManualCardNo
        : selectedInventoryCard?.cardNo ?? ''

    if (formData.cardSource === 'manual') {
      const manualCardValidationError = getManualCardNoValidationError(formData.manualCardNo)

      if (normalizedManualCardNo !== formData.manualCardNo) {
        setFormData((currentFormData) => ({
          ...currentFormData,
          manualCardNo: normalizedManualCardNo,
        }))
      }

      if (manualCardValidationError) {
        toast({
          title:
            manualCardValidationError === 'Card number is required.'
              ? 'Select a card'
              : 'Invalid card number',
          description: manualCardValidationError,
          variant: 'destructive',
        })
        return
      }
    }

    if (!selectedCardNo) {
      toast({
        title: 'Select a card',
        description:
          formData.cardSource === 'manual'
            ? 'Enter a card number before creating the member.'
            : 'Choose an available access card before creating the member.',
        variant: 'destructive',
      })
      return
    }

    setSubmissionStep('provisioning_member')

    try {
      const member = await addMember(
        {
          name: formData.name,
          type: formData.type,
          expiry: formData.expiry,
          cardSource: formData.cardSource,
          cardNo: selectedCardNo,
        },
        {
          onStepChange: setSubmissionStep,
        },
      )

      onOpenChange(false)
      setFormData(initialFormState)
      onSuccess?.(member)
      toast({
        title: 'Member added',
        description: `${member.name} was provisioned with card ${member.cardNo}.`,
      })
    } catch (error) {
      if (error instanceof MemberProvisioningError) {
        toast({
          title: 'Member creation failed',
          description: error.message,
          variant: 'destructive',
        })
      } else {
        console.error('Failed to add member:', error)
        toast({
          title: 'Member creation failed',
          description: error instanceof Error ? error.message : 'Failed to add member.',
          variant: 'destructive',
        })
      }
    } finally {
      setSubmissionStep('idle')
    }
  }

  const submitLabel =
    submissionStep === 'provisioning_member'
      ? 'Provisioning Access...'
      : 'Save Member'

  const progressDescription =
    submissionStep === 'provisioning_member'
      ? 'Creating the Hik member record and assigning the selected card.'
      : formData.cardSource === 'manual'
        ? 'Enter the member details below and type the card number to assign.'
        : isCardsLoading
          ? 'Loading imported unassigned cards.'
          : cardsError
            ? 'Could not load imported cards. Refresh or switch to manual card entry.'
            : hasNoAvailableCards
              ? 'No imported unassigned cards are available. Enter a card number manually or import more cards into iVMS-4200.'
              : 'Enter the member details below and choose an imported unassigned card.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>{progressDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter full name"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-source">Card Source</Label>
              <Select
                value={formData.cardSource}
                onValueChange={(value: MemberCardSource) =>
                  setFormData({ ...formData, cardSource: value })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="card-source">
                  <SelectValue placeholder="Select card source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inventory">Imported card inventory</SelectItem>
                  <SelectItem value="manual">Enter card number manually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="card-number">
                  {formData.cardSource === 'manual' ? 'Card Number' : 'Available Access Card'}
                </Label>
                {formData.cardSource === 'inventory' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={refetchAvailableCards}
                    disabled={isSubmitting || isCardsLoading}
                  >
                    Refresh
                  </Button>
                ) : null}
              </div>
              {formData.cardSource === 'manual' ? (
                <>
                  <Input
                    id="card-number"
                    inputMode="numeric"
                    autoComplete="off"
                    value={formData.manualCardNo}
                    onChange={(e) => setFormData({ ...formData, manualCardNo: e.target.value })}
                    placeholder="Enter card number"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use this when the physical card number is already known.
                  </p>
                </>
              ) : (
                <>
                  <Select
                    value={formData.selectedInventoryCardNo}
                    onValueChange={(value) =>
                      setFormData({ ...formData, selectedInventoryCardNo: value })
                    }
                    disabled={isSubmitting || isCardsLoading || availableCards.length === 0}
                  >
                    <SelectTrigger id="card-number">
                      <SelectValue
                        placeholder={
                          isCardsLoading
                            ? 'Loading cards...'
                            : hasNoAvailableCards
                              ? 'No cards available'
                              : 'Select an access card'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCards.map((card) => (
                        <SelectItem key={card.cardNo} value={card.cardNo}>
                          {formatAvailableAccessCardLabel(card)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isCardsLoading ? (
                    <p className="text-xs text-muted-foreground">Fetching unassigned card records from Hik.</p>
                  ) : cardsError ? (
                    <p className="text-xs text-destructive">{cardsError}</p>
                  ) : hasNoAvailableCards ? (
                    <p className="text-xs text-muted-foreground">
                      No unassigned cards are currently available from the imported inventory.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {availableCards.length} unassigned card{availableCards.length === 1 ? '' : 's'} loaded from Hik.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Membership Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: MemberType) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {memberTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiry">Expiry Date</Label>
              <Input
                id="expiry"
                type="date"
                value={formData.expiry}
                onChange={(e) => setFormData({ ...formData, expiry: e.target.value })}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                (formData.cardSource === 'inventory' && (!selectedInventoryCard || isCardsLoading))
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
