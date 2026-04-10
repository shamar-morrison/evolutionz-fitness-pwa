'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
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
import { toast } from '@/hooks/use-toast'
import {
  createManualAccessCard,
  formatAvailableAccessCardLabel,
} from '@/lib/available-cards'
import { queryKeys } from '@/lib/query-keys'
import type { AvailableAccessCard } from '@/types'

type AddAccessCardModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (card: AvailableAccessCard) => void
}

type AddAccessCardFormState = {
  cardNo: string
  cardCode: string
}

function createInitialFormState(): AddAccessCardFormState {
  return {
    cardNo: '',
    cardCode: '',
  }
}

export function AddAccessCardModal({
  open,
  onOpenChange,
  onSuccess,
}: AddAccessCardModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<AddAccessCardFormState>(createInitialFormState)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetModalState = () => {
    setFormData(createInitialFormState())
    setIsSubmitting(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) {
      return
    }

    if (!nextOpen) {
      resetModalState()
    }

    onOpenChange(nextOpen)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const cardNo = formData.cardNo.trim()
    const cardCode = formData.cardCode.trim()

    if (!cardNo) {
      toast({
        title: 'Card number required',
        description: 'Enter the card number before saving.',
        variant: 'destructive',
      })
      return
    }

    if (!cardCode) {
      toast({
        title: 'Card code required',
        description: 'Enter the card code before saving.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const createdCard = await createManualAccessCard({
        cardNo,
        cardCode,
      })

      onSuccess?.(createdCard)
      resetModalState()
      onOpenChange(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.manualCreate }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
      ])
      toast({
        title: 'Card added',
        description: `${formatAvailableAccessCardLabel(createdCard)} is now available.`,
      })
    } catch (error) {
      console.error('Failed to create manual access card:', error)
      toast({
        title: 'Card creation failed',
        description: error instanceof Error ? error.message : 'Failed to create the access card.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" isLoading={isSubmitting}>
        <DialogHeader>
          <DialogTitle>Add Access Card</DialogTitle>
          <DialogDescription>
            Add an unassigned access card directly to the available inventory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="manual-card-number">Card Number</Label>
              <Input
                id="manual-card-number"
                value={formData.cardNo}
                onChange={(event) =>
                  setFormData((currentFormData) => ({
                    ...currentFormData,
                    cardNo: event.target.value,
                  }))
                }
                placeholder="1234567890"
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-muted-foreground">
                The unique card number (e.g. 1234567890).
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="manual-card-code">Card Code</Label>
              <Input
                id="manual-card-code"
                value={formData.cardCode}
                onChange={(event) =>
                  setFormData((currentFormData) => ({
                    ...currentFormData,
                    cardCode: event.target.value,
                  }))
                }
                placeholder="N39"
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-muted-foreground">
                Optional prefix code shown to staff (e.g. N39).
              </p>
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
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
              {isSubmitting ? 'Creating Card...' : 'Create Card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
