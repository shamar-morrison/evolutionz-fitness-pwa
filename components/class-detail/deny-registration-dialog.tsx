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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatClassDate, type ClassRegistrationListItem } from '@/lib/classes'

type DenyRegistrationDialogProps = {
  denyRegistrationItem: ClassRegistrationListItem | null
  setDenyRegistrationItem: Dispatch<SetStateAction<ClassRegistrationListItem | null>>
  denyReason: string
  setDenyReason: Dispatch<SetStateAction<string>>
  isDenying: boolean
  onDeny: () => void | Promise<void>
}

export function DenyRegistrationDialog({
  denyRegistrationItem,
  setDenyRegistrationItem,
  denyReason,
  setDenyReason,
  isDenying,
  onDeny,
}: DenyRegistrationDialogProps) {
  return (
    <Dialog
      open={Boolean(denyRegistrationItem)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isDenying) {
          return
        }

        if (!nextOpen) {
          setDenyRegistrationItem(null)
          setDenyReason('')
        }
      }}
    >
      <DialogContent className="sm:max-w-lg" isLoading={isDenying}>
        <DialogHeader>
          <DialogTitle>Deny Registration</DialogTitle>
          <DialogDescription>
            Enter the reason for denying this class registration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            {denyRegistrationItem ? (
              <>
                <p className="font-medium">{denyRegistrationItem.registrant_name}</p>
                <p className="text-muted-foreground">
                  {formatClassDate(denyRegistrationItem.month_start)} ·{' '}
                  {denyRegistrationItem.registrant_type === 'member' ? 'Member' : 'Guest'}
                </p>
              </>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="deny-reason">Reason</Label>
            <Textarea
              id="deny-reason"
              value={denyReason}
              onChange={(event) => setDenyReason(event.target.value)}
              placeholder="Explain why this registration is being denied."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDenyRegistrationItem(null)}
            disabled={isDenying}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void onDeny()}
            loading={isDenying}
          >
            Deny
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
