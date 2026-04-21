'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type SetBillingPeriodDialogProps = {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  isSavingPeriod: boolean
  isPeriodPickerOpen: boolean
  setIsPeriodPickerOpen: Dispatch<SetStateAction<boolean>>
  displayedPeriodStart: string
  selectedPeriodStartDate: Date | null
  setPeriodStart: Dispatch<SetStateAction<string>>
  onSave: () => void | Promise<void>
}

export function SetBillingPeriodDialog({
  open,
  setOpen,
  isSavingPeriod,
  isPeriodPickerOpen,
  setIsPeriodPickerOpen,
  displayedPeriodStart,
  selectedPeriodStartDate,
  setPeriodStart,
  onSave,
}: SetBillingPeriodDialogProps) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" isLoading={isSavingPeriod}>
        <DialogHeader>
          <DialogTitle>Set Billing Period Start</DialogTitle>
          <DialogDescription>
            Update the start date of the active 28-day billing period for this class.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="period-start">Current period start</Label>
            <Popover open={isPeriodPickerOpen} onOpenChange={setIsPeriodPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="period-start"
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                >
                  <span>{displayedPeriodStart}</span>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedPeriodStartDate ?? undefined}
                  onSelect={(date) => {
                    if (!date) {
                      return
                    }

                    setPeriodStart(
                      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
                        2,
                        '0',
                      )}-${String(date.getDate()).padStart(2, '0')}`,
                    )
                    setIsPeriodPickerOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSavingPeriod}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void onSave()} loading={isSavingPeriod}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
