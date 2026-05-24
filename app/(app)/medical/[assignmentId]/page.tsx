'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { ArrowLeft, ClipboardList, Plus, Pencil } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useMedicalAssignment, useMedicalVisitNotes } from '@/hooks/use-medical'
import { toast } from '@/hooks/use-toast'
import {
  addMedicalVisitNote,
  completeMedicalAssignment,
  formatMedicalDate,
  formatMedicalDateFromTimestamp,
  formatMedicalTimestamp,
  getTodayMedicalDateValue,
  updateMedicalAssignmentFollowUp,
} from '@/lib/medical'
import { queryKeys } from '@/lib/query-keys'
import { useProgressRouter } from '@/hooks/use-progress-router'

async function invalidateMedicalAssignmentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  assignmentId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.medical.all, exact: false }),
    queryClient.invalidateQueries({ queryKey: queryKeys.medical.assignment(assignmentId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.medical.notes(assignmentId) }),
  ])
}

export default function MedicalAssignmentDetailPage() {
  const params = useParams()
  const router = useProgressRouter()
  const queryClient = useQueryClient()
  const assignmentId = params.assignmentId as string
  const { assignment, isLoading: isAssignmentLoading, error: assignmentError } =
    useMedicalAssignment(assignmentId)
  const { notes, isLoading: isNotesLoading, error: notesError } = useMedicalVisitNotes(
    assignmentId,
  )
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false)
  const [showVisitNoteDialog, setShowVisitNoteDialog] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [visitNotes, setVisitNotes] = useState('')
  const [noteFollowUpDate, setNoteFollowUpDate] = useState('')
  const [pendingAction, setPendingAction] = useState<null | 'complete' | 'follow-up' | 'note'>(
    null,
  )
  const isReadOnly = assignment?.status === 'completed'

  useEffect(() => {
    if (!assignment) {
      return
    }

    setFollowUpDate(assignment.followUpDate ?? '')
  }, [assignment])

  const resetVisitNoteDialog = () => {
    setVisitDate(getTodayMedicalDateValue())
    setVisitNotes('')
    setNoteFollowUpDate('')
    setShowVisitNoteDialog(false)
  }

  const handleUpdateFollowUpDate = async () => {
    if (!assignment) {
      return
    }

    setPendingAction('follow-up')

    try {
      await updateMedicalAssignmentFollowUp(assignment.id, followUpDate || null)
      await invalidateMedicalAssignmentQueries(queryClient, assignment.id)
      setShowFollowUpDialog(false)
      toast({
        title: 'Follow-up updated',
        description: followUpDate
          ? `Next follow-up is set for ${formatMedicalDate(followUpDate)}.`
          : 'The follow-up date was cleared.',
      })
    } catch (error) {
      toast({
        title: 'Unable to update follow-up date',
        description:
          error instanceof Error ? error.message : 'Failed to update the follow-up date.',
        variant: 'destructive',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleAddVisitNote = async () => {
    if (!assignment) {
      return
    }

    if (!visitDate) {
      toast({
        title: 'Visit date required',
        description: 'Enter the visit date before saving the note.',
        variant: 'destructive',
      })
      return
    }

    setPendingAction('note')

    try {
      await addMedicalVisitNote(assignment.id, {
        visitDate,
        notes: visitNotes,
        ...(noteFollowUpDate ? { followUpDate: noteFollowUpDate } : {}),
      })
      await invalidateMedicalAssignmentQueries(queryClient, assignment.id)
      resetVisitNoteDialog()
      toast({
        title: 'Visit note added',
        description: 'The visit note was saved successfully.',
      })
    } catch (error) {
      toast({
        title: 'Unable to add visit note',
        description:
          error instanceof Error ? error.message : 'Failed to save the visit note.',
        variant: 'destructive',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleCompleteAssignment = async () => {
    if (!assignment) {
      return
    }

    setPendingAction('complete')

    try {
      await completeMedicalAssignment(assignment.id)
      await invalidateMedicalAssignmentQueries(queryClient, assignment.id)
      setShowCompleteDialog(false)
      router.push('/medical')
    } catch (error) {
      toast({
        title: 'Unable to complete assignment',
        description:
          error instanceof Error ? error.message : 'Failed to complete the assignment.',
        variant: 'destructive',
      })
      setPendingAction(null)
    }
  }

  if (isAssignmentLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (assignmentError || !assignment) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-destructive">
          {assignmentError instanceof Error
            ? assignmentError.message
            : 'Medical assignment not found.'}
        </p>
        <Button variant="outline" onClick={() => router.push('/medical')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Medical
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/medical')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{assignment.memberName}</h1>
            <p className="text-sm text-muted-foreground">
              Medical/consultant assignment details
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Assignment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Client</p>
                  <p className="font-medium">{assignment.memberName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Membership Type</p>
                  <p className="font-medium">{assignment.memberType}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Status</p>
                  <p className="font-medium">{assignment.memberStatus}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Assigned Staff</p>
                  <p className="font-medium">{assignment.staffName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Assigned Date</p>
                  <p className="font-medium">
                    {formatMedicalDateFromTimestamp(assignment.createdAt)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Follow-up Date</p>
                  <p className="font-medium">
                    {assignment.followUpDate
                      ? formatMedicalDate(assignment.followUpDate)
                      : 'Not set'}
                  </p>
                </div>
                {assignment.completedAt ? (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-sm">Completed</p>
                    <p className="font-medium">
                      {formatMedicalDateFromTimestamp(assignment.completedAt)}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {isReadOnly ? (
              <p className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                This assignment has been completed and is now read-only.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setShowFollowUpDialog(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit Follow-up Date
                </Button>
                <Button variant="outline" onClick={() => {
                  setVisitDate(getTodayMedicalDateValue())
                  setVisitNotes('')
                  setNoteFollowUpDate('')
                  setShowVisitNoteDialog(true)
                }}>
                  <Plus className="h-4 w-4" />
                  Add Visit Note
                </Button>
                <Button variant="destructive" onClick={() => setShowCompleteDialog(true)}>
                  Mark as Complete
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visit Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isNotesLoading ? (
              <>
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </>
            ) : notesError ? (
              <p className="text-sm text-destructive">
                {notesError instanceof Error
                  ? notesError.message
                  : 'Failed to load visit notes.'}
              </p>
            ) : notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visit notes recorded yet.</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium">{formatMedicalDate(note.visitDate)}</p>
                    <p className="text-muted-foreground text-sm">
                      Added {formatMedicalTimestamp(note.createdAt)}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">
                    {note.notes || 'No additional notes recorded.'}
                  </p>
                  {note.followUpDate ? (
                    <p className="text-muted-foreground text-sm">
                      Follow-up set for {formatMedicalDate(note.followUpDate)}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={showFollowUpDialog}
        onOpenChange={(open) => {
          if (!open && pendingAction !== 'follow-up') {
            setShowFollowUpDialog(false)
          } else if (open) {
            setShowFollowUpDialog(true)
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px]" isLoading={pendingAction === 'follow-up'}>
          <DialogHeader>
            <DialogTitle>Edit Follow-up Date</DialogTitle>
            <DialogDescription>
              Update or clear the assignment follow-up date.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="assignment-follow-up-date">Follow-up Date</Label>
            <Input
              id="assignment-follow-up-date"
              type="date"
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
              disabled={pendingAction === 'follow-up'}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFollowUpDate(assignment.followUpDate ?? '')
                setShowFollowUpDialog(false)
              }}
              disabled={pendingAction === 'follow-up'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleUpdateFollowUpDate()}
              loading={pendingAction === 'follow-up'}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showVisitNoteDialog}
        onOpenChange={(open) => {
          if (!open && pendingAction !== 'note') {
            resetVisitNoteDialog()
          } else if (open) {
            setShowVisitNoteDialog(true)
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]" isLoading={pendingAction === 'note'}>
          <DialogHeader>
            <DialogTitle>Add Visit Note</DialogTitle>
            <DialogDescription>
              Record the visit date, a non-sensitive summary, and an optional new follow-up date.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="visit-date">Visit Date</Label>
              <Input
                id="visit-date"
                type="date"
                value={visitDate}
                onChange={(event) => setVisitDate(event.target.value)}
                disabled={pendingAction === 'note'}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="visit-notes">Notes</Label>
              <Textarea
                id="visit-notes"
                value={visitNotes}
                onChange={(event) => setVisitNotes(event.target.value)}
                rows={6}
                disabled={pendingAction === 'note'}
              />
              <p className="text-muted-foreground text-sm">
                Do not record sensitive medical information including diagnoses,
                prescriptions, or treatment history.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="visit-follow-up-date">Follow-up Date</Label>
              <Input
                id="visit-follow-up-date"
                type="date"
                value={noteFollowUpDate}
                onChange={(event) => setNoteFollowUpDate(event.target.value)}
                disabled={pendingAction === 'note'}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={resetVisitNoteDialog}
              disabled={pendingAction === 'note'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddVisitNote()}
              loading={pendingAction === 'note'}
            >
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showCompleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCompleteDialog(false)
          }
        }}
        title="Mark assignment as complete?"
        description="This assignment will move to the completed list and become read-only."
        confirmLabel="Mark as Complete"
        cancelLabel="Cancel"
        onConfirm={() => void handleCompleteAssignment()}
        onCancel={() => setShowCompleteDialog(false)}
        variant="destructive"
        isLoading={pendingAction === 'complete'}
      />
    </>
  )
}
