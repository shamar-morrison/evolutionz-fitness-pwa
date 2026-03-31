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
} from '@/lib/member-actions'
import { useAvailableCards } from '@/hooks/use-available-cards'
import { formatAvailableAccessCardLabel } from '@/lib/available-cards'
import { buildMemberDisplayName, hasUsableCardCode } from '@/lib/member-name'
import { toast } from '@/hooks/use-toast'
import type { Member, MemberType } from '@/types'

type AddMemberModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (member: Member) => void
}

type AddMemberFormState = {
  name: string
  selectedInventoryCardNo: string
  type: MemberType
  expiry: string
}

const memberTypes: MemberType[] = ['General', 'Civil Servant', 'Student/BPO']

const initialFormState: AddMemberFormState = {
  name: '',
  selectedInventoryCardNo: '',
  type: 'General',
  expiry: '',
}

function getDefaultCardNo(cards: Array<{ cardNo: string; cardCode: string | null }>) {
  return cards.find((card) => hasUsableCardCode(card.cardCode))?.cardNo ?? cards[0]?.cardNo ?? ''
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
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
  const minimumExpiryDate = useMemo(() => formatDateInputValue(new Date()), [open])

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
        : getDefaultCardNo(availableCards),
    }))
  }, [availableCards, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedInventoryCard?.cardNo) {
      toast({
        title: 'Select a card',
        description: 'Choose an available access card before creating the member.',
        variant: 'destructive',
      })
      return
    }

    const selectedCardCode = selectedInventoryCard.cardCode ?? ''

    if (!hasUsableCardCode(selectedCardCode)) {
      toast({
        title: 'Card code required',
        description: 'This card is missing its synced card code. Re-sync the imported cards and try again.',
        variant: 'destructive',
      })
      return
    }

    if (formData.expiry && formData.expiry < minimumExpiryDate) {
      toast({
        title: 'Invalid expiry date',
        description: 'Choose today or a future date for the membership expiry.',
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
          cardNo: selectedInventoryCard.cardNo,
          cardCode: selectedCardCode,
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
        description: `${buildMemberDisplayName(member.name, member.cardCode)} was provisioned with card ${member.cardNo}.`,
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
      : isCardsLoading
        ? 'Loading imported unassigned cards.'
        : cardsError
          ? 'Could not load imported cards. Refresh the inventory and try again.'
          : hasNoAvailableCards
            ? 'No imported unassigned cards are available. Import more cards into iVMS-4200 and re-sync.'
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
              <div className="flex overflow-hidden rounded-md border border-input bg-background">
                {selectedInventoryCard?.cardCode ? (
                  <span className="flex items-center border-r border-input bg-muted px-3 text-sm font-medium text-muted-foreground">
                    {selectedInventoryCard.cardCode}
                  </span>
                ) : null}
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={
                    selectedInventoryCard?.cardCode
                      ? 'Enter member name'
                      : 'Select a card with a synced card code'
                  }
                  className="border-0 shadow-none focus-visible:ring-0"
                  disabled={!selectedInventoryCard?.cardCode}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The card code prefix is shown here for staff and sent to Hik automatically.
              </p>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="card-number">Available Access Card</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={refetchAvailableCards}
                  disabled={isSubmitting || isCardsLoading}
                >
                  Refresh
                </Button>
              </div>
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
                ) : selectedInventoryCard && !selectedInventoryCard.cardCode ? (
                  <p className="text-xs text-destructive">
                    This card is missing its synced card code and cannot be assigned until the next successful sync.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {availableCards.length} unassigned card{availableCards.length === 1 ? '' : 's'} loaded from Hik.
                  </p>
                )}
              </>
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
                min={minimumExpiryDate}
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
              disabled={isSubmitting || !selectedInventoryCard || !selectedInventoryCard.cardCode || isCardsLoading}
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
