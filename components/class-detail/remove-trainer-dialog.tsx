'use client'

import type { Dispatch, SetStateAction } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type ClassTrainerProfile } from '@/lib/classes'

type RemoveTrainerDialogProps = {
  classItemName: string
  trainerToRemove: ClassTrainerProfile | null
  setTrainerToRemove: Dispatch<SetStateAction<ClassTrainerProfile | null>>
  onConfirm: () => void | Promise<void>
}

export function RemoveTrainerDialog({
  classItemName,
  trainerToRemove,
  setTrainerToRemove,
  onConfirm,
}: RemoveTrainerDialogProps) {
  return (
    <ConfirmDialog
      open={Boolean(trainerToRemove)}
      onOpenChange={(open) => {
        if (!open) {
          setTrainerToRemove(null)
        }
      }}
      title="Remove trainer from class?"
      description={
        trainerToRemove
          ? `${trainerToRemove.name} will no longer be assigned to ${classItemName}.`
          : 'This trainer will no longer be assigned to this class.'
      }
      confirmLabel="Remove Trainer"
      cancelLabel="Cancel"
      onConfirm={() => void onConfirm()}
      onCancel={() => setTrainerToRemove(null)}
      variant="destructive"
    />
  )
}
