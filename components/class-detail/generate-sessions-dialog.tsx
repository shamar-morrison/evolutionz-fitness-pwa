'use client'

import type { Dispatch, SetStateAction } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  formatClassDate,
  formatClassTime,
  getClassDayOfWeekLabel,
  type ClassSessionPreviewItem,
} from '@/lib/classes'

type GenerateSessionsDialogProps = {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  isGeneratingSessions: boolean
  currentPeriodStart: string | null
  hasScheduleRules: boolean
  hasExistingSessions: boolean
  previewItems: ClassSessionPreviewItem[]
  setPreviewItems: Dispatch<SetStateAction<ClassSessionPreviewItem[]>>
  onConfirm: () => void | Promise<void>
}

export function GenerateSessionsDialog({
  open,
  setOpen,
  isGeneratingSessions,
  currentPeriodStart,
  hasScheduleRules,
  hasExistingSessions,
  previewItems,
  setPreviewItems,
  onConfirm,
}: GenerateSessionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        isLoading={isGeneratingSessions}
      >
        <DialogHeader>
          <DialogTitle>Generate Sessions</DialogTitle>
          <DialogDescription>
            Review the current-period session preview before creating class sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!currentPeriodStart ? (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Period Start Required</AlertTitle>
              <AlertDescription>
                Set a period start date before generating sessions.
              </AlertDescription>
            </Alert>
          ) : null}

          {!hasScheduleRules ? (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Schedule Rules Required</AlertTitle>
              <AlertDescription>
                Add schedule rules before generating sessions.
              </AlertDescription>
            </Alert>
          ) : null}

          {currentPeriodStart && hasExistingSessions ? (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Sessions Already Exist</AlertTitle>
              <AlertDescription>
                Sessions already exist for this period. You can still continue; duplicates will be
                ignored server-side.
              </AlertDescription>
            </Alert>
          ) : null}

          {previewItems.length === 0 && currentPeriodStart && hasScheduleRules ? (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Preview Dates Remaining</AlertTitle>
              <AlertDescription>
                Keep at least one preview date before confirming session generation.
              </AlertDescription>
            </Alert>
          ) : null}

          {previewItems.length > 0 ? (
            <div className="rounded-lg border">
              {previewItems.map((previewItem) => (
                <div
                  key={previewItem.scheduled_at}
                  className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
                >
                  <div>
                    <p className="font-medium">{formatClassDate(previewItem.date_value)}</p>
                    <p className="text-sm text-muted-foreground">
                      {getClassDayOfWeekLabel(previewItem.day_of_week)} at{' '}
                      {formatClassTime(previewItem.session_time)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${previewItem.scheduled_at}`}
                    disabled={isGeneratingSessions}
                    onClick={() =>
                      setPreviewItems((current) =>
                        current.filter(
                          (currentPreviewItem) =>
                            currentPreviewItem.scheduled_at !== previewItem.scheduled_at,
                        ),
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isGeneratingSessions}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm()}
            disabled={
              isGeneratingSessions ||
              !currentPeriodStart ||
              !hasScheduleRules ||
              previewItems.length === 0
            }
            loading={isGeneratingSessions}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
