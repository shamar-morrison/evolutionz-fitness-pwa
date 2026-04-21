'use client'

import type { Dispatch, SetStateAction } from 'react'
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
import { getClassDayOfWeekLabel, type ClassScheduleRuleDay } from '@/lib/classes'

type AddScheduleRuleDialogProps = {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  scheduleRuleDay: ClassScheduleRuleDay
  setScheduleRuleDay: Dispatch<SetStateAction<ClassScheduleRuleDay>>
  scheduleRuleTime: string
  setScheduleRuleTime: Dispatch<SetStateAction<string>>
  isSavingScheduleRule: boolean
  onSave: () => void | Promise<void>
}

export function AddScheduleRuleDialog({
  open,
  setOpen,
  scheduleRuleDay,
  setScheduleRuleDay,
  scheduleRuleTime,
  setScheduleRuleTime,
  isSavingScheduleRule,
  onSave,
}: AddScheduleRuleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" isLoading={isSavingScheduleRule}>
        <DialogHeader>
          <DialogTitle>Add Schedule Rule</DialogTitle>
          <DialogDescription>
            Add a recurring weekday and time used when generating current-period sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="schedule-rule-day">Day of week</Label>
            <Select
              value={String(scheduleRuleDay)}
              onValueChange={(value) => setScheduleRuleDay(Number(value) as ClassScheduleRuleDay)}
              disabled={isSavingScheduleRule}
            >
              <SelectTrigger id="schedule-rule-day" className="w-full">
                <SelectValue placeholder="Select a day" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 7 }).map((_, index) => (
                  <SelectItem key={index} value={String(index)}>
                    {getClassDayOfWeekLabel(index)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule-rule-time">Session time</Label>
            <Input
              id="schedule-rule-time"
              type="time"
              value={scheduleRuleTime}
              onChange={(event) => setScheduleRuleTime(event.target.value)}
              disabled={isSavingScheduleRule}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSavingScheduleRule}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void onSave()} loading={isSavingScheduleRule}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
