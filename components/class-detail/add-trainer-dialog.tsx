'use client'

import type { Dispatch, SetStateAction } from 'react'
import { SearchableSelect } from '@/components/searchable-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { type ClassTrainerProfile } from '@/lib/classes'

type AddTrainerDialogProps = {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  isSavingTrainer: boolean
  selectedTrainerId: string
  setSelectedTrainerId: Dispatch<SetStateAction<string>>
  availableTrainers: ClassTrainerProfile[]
  selectedTrainer: ClassTrainerProfile | null
  staffError: unknown
  staffLoading: boolean
  trainersLoading: boolean
  onSave: () => void | Promise<void>
}

export function AddTrainerDialog({
  open,
  setOpen,
  isSavingTrainer,
  selectedTrainerId,
  setSelectedTrainerId,
  availableTrainers,
  selectedTrainer,
  staffError,
  staffLoading,
  trainersLoading,
  onSave,
}: AddTrainerDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSavingTrainer) {
          return
        }

        setOpen(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-md" isLoading={isSavingTrainer}>
        <DialogHeader>
          <DialogTitle>Add Trainer</DialogTitle>
          <DialogDescription>
            Assign a trainer-title staff profile to this class.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="class-trainer-select">Trainer</Label>
            <SearchableSelect
              value={selectedTrainerId || null}
              onValueChange={setSelectedTrainerId}
              options={availableTrainers.map((trainer) => ({
                value: trainer.id,
                label: trainer.name,
                description: trainer.titles.join(', '),
                keywords: trainer.titles,
              }))}
              placeholder={availableTrainers.length > 0 ? 'Select a trainer' : 'No trainers available'}
              searchPlaceholder="Search trainers..."
              emptyMessage="No matching trainers found."
              disabled={
                isSavingTrainer ||
                trainersLoading ||
                staffLoading ||
                Boolean(staffError) ||
                availableTrainers.length === 0
              }
            />
          </div>

          {staffError ? (
            <p className="text-sm text-destructive">
              {staffError instanceof Error
                ? staffError.message
                : 'Failed to load available trainers.'}
            </p>
          ) : null}

          {availableTrainers.length === 0 && !staffLoading && !staffError ? (
            <p className="text-sm text-muted-foreground">
              All trainer-title staff are already assigned to this class.
            </p>
          ) : null}

          {selectedTrainer ? (
            <div className="rounded-lg border p-3">
              <div className="font-medium">{selectedTrainer.name}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedTrainer.titles.map((title) => (
                  <Badge key={title} variant="outline">
                    {title}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSavingTrainer}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={isSavingTrainer}
            onClick={() => void onSave()}
            disabled={
              isSavingTrainer ||
              trainersLoading ||
              staffLoading ||
              Boolean(staffError) ||
              !selectedTrainer
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
