'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AssignCardModal } from '@/components/assign-card-modal'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { formatAccessDate } from '@/lib/member-access-time'
import { useMember } from '@/hooks/use-members'
import { MemberAvatar } from '@/components/member-avatar'
import { MemberPtAttendance } from '@/components/member-pt-attendance'
import { MemberPtSection } from '@/components/member-pt-section'
import { StatusBadge } from '@/components/status-badge'
import { CheckInHistory } from '@/components/check-in-history'
import { EditMemberModal } from '@/components/edit-member-modal'
import { RoleGuard } from '@/components/role-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  deleteMember,
  deleteMemberPhoto,
  recoverMemberCard,
  reactivateMember,
  reportMemberCardLost,
  releaseMemberSlot,
  suspendMember,
  unassignMemberCard,
} from '@/lib/member-actions'
import { hasAssignedCard } from '@/lib/member-card'
import { getMemberCardActionState } from '@/lib/member-card-action-state'
import { buildMemberDisplayName, getCleanMemberName } from '@/lib/member-name'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/hooks/use-toast'
import { useBackLink } from '@/hooks/use-back-link'
import { ArrowLeft, Pencil, Ban, RefreshCw, CreditCard, Trash2, User } from 'lucide-react'

export default function MemberDetailPage() {
  const params = useParams()
  const router = useRouter()
  const memberId = params.id as string
  const queryClient = useQueryClient()
  const { member, isLoading, error } = useMember(memberId)
  const backLink = useBackLink('/members', '/trainer/clients')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAssignCardModal, setShowAssignCardModal] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null)
  const [activeDialog, setActiveDialog] = useState<
    | null
    | 'suspend'
    | 'reactivate'
    | 'unassign'
    | 'report-lost'
    | 'recover-card'
    | 'delete-photo'
    | 'delete-member'
  >(null)

  const invalidateMemberQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(memberId) }),
    ])

  const invalidateMemberAndCardQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(memberId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
    ])

  const invalidateDeletedMemberQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.cards.available }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentMembers }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.expiringMembers }),
    ])

  const handleSuspendToggle = async () => {
    if (!member) return

    setIsActionLoading(true)

    try {
      if (member.status === 'Suspended') {
        await reactivateMember(member.id)
      } else {
        await suspendMember(member)
      }

      void invalidateMemberQueries()
    } catch (error) {
      console.error('Failed to update member status:', error)
      toast({
        title: member.status === 'Suspended' ? 'Reactivation failed' : 'Suspension failed',
        description:
          error instanceof Error ? error.message : 'Failed to update this member’s access.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleUnassignCard = async () => {
    if (!member) return

    setIsActionLoading(true)

    try {
      await unassignMemberCard(member)
      void invalidateMemberAndCardQueries()
    } catch (error) {
      console.error('Failed to unassign member card:', error)
      toast({
        title: 'Card unassign failed',
        description:
          error instanceof Error ? error.message : 'Failed to unassign this member’s card.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleReportCardLost = async () => {
    if (!member) return

    setIsActionLoading(true)

    try {
      await reportMemberCardLost(member)
      void invalidateMemberQueries()
    } catch (error) {
      console.error('Failed to report member card lost:', error)
      toast({
        title: 'Report lost card failed',
        description:
          error instanceof Error ? error.message : 'Failed to report this member card as lost.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleRecoverCard = async () => {
    if (!member) return

    setIsActionLoading(true)

    try {
      await recoverMemberCard(member)
      void invalidateMemberQueries()
    } catch (error) {
      console.error('Failed to recover member card:', error)
      toast({
        title: 'Card recovery failed',
        description:
          error instanceof Error ? error.message : 'Failed to recover this member card.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleReleaseSlot = async () => {
    if (!member) return
    setIsActionLoading(true)
    try {
      await releaseMemberSlot(member)
      toast({
        title: 'Slot released',
        description: `${buildMemberDisplayName(member.name, member.cardCode)}'s Hik slot was returned to the available pool.`,
      })
    } catch (error) {
      console.error('Failed to release Hik slot:', error)
      toast({
        title: 'Slot release failed',
        description:
          error instanceof Error ? error.message : 'Failed to release this member’s Hik slot.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  useEffect(() => {
    setAvatarPhotoUrl(member?.photoUrl ?? null)
  }, [member?.photoUrl])

  const handleDeletePhoto = async () => {
    if (!member) return

    setIsActionLoading(true)

    try {
      await deleteMemberPhoto(member.id)
      setAvatarPhotoUrl(null)
      setActiveDialog(null)
      await queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) })
      toast({
        title: 'Photo deleted',
        description: `${buildMemberDisplayName(member.name, member.cardCode)}’s photo was removed.`,
      })
    } catch (error) {
      console.error('Failed to delete member photo:', error)
      toast({
        title: 'Photo deletion failed',
        description:
          error instanceof Error ? error.message : 'Failed to delete this member photo.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleDeleteMember = async () => {
    if (!member) return

    setIsActionLoading(true)

    try {
      const result = await deleteMember(member.id)
      setActiveDialog(null)
      await invalidateDeletedMemberQueries()
      toast({
        title: 'Member deleted',
        description:
          result.warning ??
          `${buildMemberDisplayName(member.name, member.cardCode)} was permanently deleted.`,
      })
      router.replace('/members')
    } catch (error) {
      console.error('Failed to delete member:', error)
      toast({
        title: 'Member deletion failed',
        description:
          error instanceof Error ? error.message : 'Failed to delete this member.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  if (error) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-destructive">Member not found</p>
        <Button variant="outline" onClick={() => router.push(backLink)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Members
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-64 md:col-span-1" />
          <Skeleton className="h-64 md:col-span-2" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!member) return null

  const memberDisplayName = buildMemberDisplayName(member.name, member.cardCode)
  const memberHasAssignedCard = hasAssignedCard(member.cardNo)
  const cardActionState = getMemberCardActionState({
    cardNo: member.cardNo,
    cardStatus: member.cardStatus,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(backLink)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Member Details</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="relative lg:col-span-1">
          <RoleGuard role="admin">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4 z-10 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setActiveDialog('delete-member')}
              disabled={isActionLoading}
              aria-label="Delete member"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </RoleGuard>
          <CardContent className="flex flex-col items-center pt-6">
            <div className="relative">
              <MemberAvatar
                name={getCleanMemberName(member.name, member.cardCode)}
                photoUrl={avatarPhotoUrl}
                size="lg"
                className="h-28 w-28 text-2xl"
              />
              <RoleGuard role="admin">
                {avatarPhotoUrl ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="absolute bottom-0 right-0 z-10 size-8 rounded-full border-2 border-background shadow-sm"
                    onClick={() => setActiveDialog('delete-photo')}
                    disabled={isActionLoading}
                    aria-label="Delete member photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </RoleGuard>
            </div>
            <h2 className="mt-4 text-xl font-bold">{memberDisplayName}</h2>
            <Badge variant="outline" className="mt-2">
              {member.type}
            </Badge>

            <div className="mt-6 w-full space-y-3">
              <RoleGuard role="admin">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowEditModal(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Member
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setActiveDialog(member.status === 'Suspended' ? 'reactivate' : 'suspend')
                  }
                  disabled={isActionLoading}
                >
                  {member.status === 'Suspended' ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reactivate
                    </>
                  ) : (
                    <>
                      <Ban className="mr-2 h-4 w-4" />
                      Suspend
                    </>
                  )}
                </Button>

                {!memberHasAssignedCard && member.status !== 'Suspended' ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowAssignCardModal(true)}
                    disabled={isActionLoading}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Assign Card
                  </Button>
                ) : null}

                {cardActionState.showUnassignCard ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block w-full">
                        <Button
                          variant="destructive"
                          className="w-full"
                          onClick={() => setActiveDialog('unassign')}
                          disabled={isActionLoading || cardActionState.disableUnassignCard}
                        >
                          <CreditCard className="mr-2 h-4 w-4" />
                          Unassign Card
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!memberHasAssignedCard ? <TooltipContent>No card assigned</TooltipContent> : null}
                  </Tooltip>
                ) : null}

                {cardActionState.showReportCardLost ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block w-full">
                        <Button
                          variant="destructive"
                          className="w-full"
                          onClick={() => setActiveDialog('report-lost')}
                          disabled={isActionLoading || cardActionState.disableReportCardLost}
                        >
                          <CreditCard className="mr-2 h-4 w-4" />
                          Report Card Lost
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {cardActionState.disableReportCardLost ? (
                      <TooltipContent>No card assigned</TooltipContent>
                    ) : null}
                  </Tooltip>
                ) : null}

                {cardActionState.showRecoverCard ? (
                  <Button
                    className="w-full bg-green-600 text-white hover:bg-green-700"
                    onClick={() => setActiveDialog('recover-card')}
                    disabled={isActionLoading}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Card Recovered
                  </Button>
                ) : null}

                {cardActionState.showDisabledCardLabel ? (
                  <div className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                    Card permanently disabled
                  </div>
                ) : null}

                {member.slotPlaceholderName ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={isActionLoading || member.deviceAccessState === 'released'}
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        Release Slot
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Release Hik Slot?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will restore slot {member.slotPlaceholderName} on the Hik device and
                          make it available for reassignment.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleReleaseSlot}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Release Slot
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </RoleGuard>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="info" className="lg:col-span-2 gap-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto min-w-max flex-wrap justify-start gap-1 bg-muted/60 p-1">
              <TabsTrigger value="info" className="px-3 py-1.5">
                Info
              </TabsTrigger>
              <TabsTrigger value="checkin" className="px-3 py-1.5">
                Check-in History
              </TabsTrigger>
              <RoleGuard role="admin">
                <TabsTrigger value="pt-attendance" className="px-3 py-1.5">
                  PT Attendance
                </TabsTrigger>
              </RoleGuard>
            </TabsList>
          </div>

          <TabsContent value="info">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Member Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Card ID</p>
                    <p className="font-mono font-medium">{member.cardNo ?? 'Unassigned'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Hik Person ID</p>
                    <p className="font-mono font-medium">{member.employeeNo}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Placeholder Slot</p>
                    <p className="font-medium">{member.slotPlaceholderName ?? 'Not recorded'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Membership Type</p>
                    <p className="font-medium">{member.type}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Gender</p>
                    <p className="font-medium">{member.gender ?? 'Not set'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{member.email ?? 'Not set'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{member.phone ?? 'Not set'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Remark</p>
                    <p className="font-medium">{member.remark ?? 'Not set'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={member.status} />
                      {member.deviceAccessState === 'released' ? (
                        <Badge className="bg-slate-500/15 text-slate-700 hover:bg-slate-500/25">
                          Slot Released
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <p className="font-medium">{formatAccessDate(member.beginTime, 'long')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">End Date</p>
                    <p className="font-medium">{formatAccessDate(member.endTime, 'long')}</p>
                  </div>
                </div>

                {member.deviceAccessState === 'released' ? (
                  <div className="mt-6 rounded-lg border border-slate-500/30 bg-slate-500/10 p-4 text-sm text-slate-900">
                    This member&apos;s Hik slot has been released back to the available pool as{' '}
                    {member.slotPlaceholderName ?? member.employeeNo}.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checkin">
            <CheckInHistory memberId={memberId} />
          </TabsContent>

          <RoleGuard role="admin">
            <TabsContent value="pt-attendance">
              <MemberPtAttendance memberId={memberId} />
            </TabsContent>
          </RoleGuard>
        </Tabs>
      </div>

      <RoleGuard role="admin">
        <MemberPtSection memberId={memberId} />
      </RoleGuard>

      <AssignCardModal
        member={member}
        open={showAssignCardModal}
        onOpenChange={setShowAssignCardModal}
      />

      <ConfirmDialog
        open={activeDialog === 'suspend'}
        onOpenChange={(open) => setActiveDialog(open ? 'suspend' : null)}
        title="Suspend member?"
        description="Are you sure you want to suspend this member? Their card will no longer work at the door."
        confirmLabel="Suspend Member"
        cancelLabel="Cancel"
        onConfirm={() => void handleSuspendToggle()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
        variant="destructive"
      />

      <ConfirmDialog
        open={activeDialog === 'reactivate'}
        onOpenChange={(open) => setActiveDialog(open ? 'reactivate' : null)}
        title="Reactivate member?"
        description="Reactivate this member? This will restore their account but will not re-issue door access."
        confirmLabel="Reactivate"
        cancelLabel="Cancel"
        onConfirm={() => void handleSuspendToggle()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
      />

      <ConfirmDialog
        open={activeDialog === 'unassign'}
        onOpenChange={(open) => setActiveDialog(open ? 'unassign' : null)}
        title="Unassign card?"
        description="This will remove the card from this member and make it available for reassignment. The member will be suspended. This cannot be undone."
        confirmLabel="Unassign Card"
        cancelLabel="Cancel"
        onConfirm={() => void handleUnassignCard()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
        variant="destructive"
      />

      <ConfirmDialog
        open={activeDialog === 'report-lost'}
        onOpenChange={(open) => setActiveDialog(open ? 'report-lost' : null)}
        title="Report this card as lost?"
        description="Door access will be immediately suspended. If the card is not recovered within 5 days it will be permanently disabled."
        confirmLabel="Report Card Lost"
        cancelLabel="Cancel"
        onConfirm={() => void handleReportCardLost()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
        variant="destructive"
      />

      <ConfirmDialog
        open={activeDialog === 'recover-card'}
        onOpenChange={(open) => setActiveDialog(open ? 'recover-card' : null)}
        title="Mark this card as recovered?"
        description="Mark this card as recovered? Door access will be restored and the member will be reactivated."
        confirmLabel="Card Recovered"
        cancelLabel="Cancel"
        onConfirm={() => void handleRecoverCard()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
      />

      <ConfirmDialog
        open={activeDialog === 'delete-photo'}
        onOpenChange={(open) => setActiveDialog(open ? 'delete-photo' : null)}
        title="Delete member photo?"
        description="This will permanently delete the member's photo. This action cannot be undone."
        confirmLabel="Delete Photo"
        cancelLabel="Cancel"
        onConfirm={() => void handleDeletePhoto()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
        variant="destructive"
      />

      <ConfirmDialog
        open={activeDialog === 'delete-member'}
        onOpenChange={(open) => setActiveDialog(open ? 'delete-member' : null)}
        title="Delete member?"
        description="This will permanently delete this member and unassign their card. This cannot be undone."
        confirmLabel="Delete Member"
        cancelLabel="Cancel"
        onConfirm={() => void handleDeleteMember()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
        variant="destructive"
      />

      <EditMemberModal
        member={member}
        open={showEditModal}
        onOpenChange={setShowEditModal}
      />
    </div>
  )
}
