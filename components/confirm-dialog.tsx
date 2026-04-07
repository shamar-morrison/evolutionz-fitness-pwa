'use client'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
  onOpenChange: (open: boolean) => void
  variant?: 'default' | 'destructive'
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  onOpenChange,
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isLoading) {
      return
    }

    onOpenChange(nextOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent isLoading={isLoading}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={onConfirm}
            loading={isLoading}
            variant={variant === 'destructive' ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
