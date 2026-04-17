'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { AssignCardModal } from '@/components/assign-card-modal'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { formatAccessDate, formatDateInputDisplay } from '@/lib/member-access-time'
import { useMember } from '@/hooks/use-members'
import { MemberAvatar } from '@/components/member-avatar'
import { MemberPaymentHistory } from '@/components/member-payment-history'
import { MemberPtAttendance } from '@/components/member-pt-attendance'
import { MemberPtSection } from '@/components/member-pt-section'
import { StatusBadge } from '@/components/status-badge'
import { CheckInHistory } from '@/components/check-in-history'
import { EditMemberModal } from '@/components/edit-member-modal'
import { ExtendMembershipDialog } from '@/components/extend-membership-dialog'
import { RecordMemberPaymentDialog } from '@/components/record-member-payment-dialog'
import { RoleGuard } from '@/components/role-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { usePermissions } from '@/hooks/use-permissions'
import { useProgressRouter } from '@/hooks/use-progress-router'
import { isRouteAllowed } from '@/lib/route-config'
import { isFrontDeskStaff } from '@/lib/staff'
import { isMemberExtensionEligible } from '@/lib/member-extension'
import {
  ArrowLeft,
  Pencil,
  Ban,
  RefreshCw,
  CreditCard,
  Trash2,
  User,
  BanknoteIcon,
  CalendarDays,
  X,
} from 'lucide-react'

function resolveReturnToPath(
  value: string | null,
  fallbackPath: string,
  role: 'admin' | 'staff',
  titles: string[],
) {
  if (!value || !value.startsWith('/')) {
    return fallbackPath
  }

  try {
    const currentOrigin =
      typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    const url = new URL(value, currentOrigin)

    if (url.origin !== currentOrigin || !isRouteAllowed(url.pathname, role, titles)) {
      return fallbackPath
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallbackPath
  }
}

export default function MemberDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useProgressRouter()
  const memberId = params.id as string
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { member, isLoading, error } = useMember(memberId)
  const fallbackBackLink = useBackLink('/members', '/trainer/clients')
  const { can, requiresApproval, role } = usePermissions()
  const appRole = role === 'admin' ? 'admin' : 'staff'
  const isFrontDesk = isFrontDeskStaff(profile?.titles)
  const returnToParam = searchParams?.get('returnTo') ?? null
  const backLink = useMemo(
    () =>
      resolveReturnToPath(
        returnToParam,
        fallbackBackLink,
        appRole,
        profile?.titles ?? [],
      ),
    [appRole, fallbackBackLink, profile?.titles, returnToParam],
  )
  const [showEditModal, setShowEditModal] = useState(false)
  const [showExtendMembershipModal, setShowExtendMembershipModal] = useState(false)
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false)
  const [showAssignCardModal, setShowAssignCardModal] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [activeDialog, setActiveDialog] = useState<
    | null
    | 'suspend'
    | 'reactivate'
    | 'unassign'
    | 'report-lost'
    | 'recover-card'
    | 'release-slot'
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

      setActiveDialog(null)
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
      setActiveDialog(null)
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
      setActiveDialog(null)
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
      setActiveDialog(null)
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
      setActiveDialog(null)
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
      router.replace(backLink)
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
  const canEditMember = can('members.edit')
  const canViewAllPtSchedules = can('pt.viewAllSchedules')
  const showEditMemberAction = canEditMember
  const showExtendMembershipAction = can('members.extendMembership')
  const showDirectMemberPhotoActions = canEditMember && !isFrontDesk
  const showRecordPaymentAction = can('members.recordPayment')
  const showPtAttendance = canViewAllPtSchedules || isFrontDesk
  const showPaymentsTab = role === 'admin'
  const cardActionState = getMemberCardActionState({
    cardNo: member.cardNo,
    cardStatus: member.cardStatus,
  })
  const isMembershipExtensionAvailable = isMemberExtensionEligible(member.endTime)

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
              <button
                type="button"
                aria-label="View member photo"
                onClick={() => avatarPhotoUrl && setLightboxOpen(true)}
                className={avatarPhotoUrl ? 'cursor-zoom-in rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring' : 'cursor-default'}
              >
                <MemberAvatar
                  name={getCleanMemberName(member.name, member.cardCode)}
                  photoUrl={avatarPhotoUrl}
                  size="lg"
                  className="h-28 w-28 text-2xl"
                />
              </button>
              {showDirectMemberPhotoActions && avatarPhotoUrl ? (
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
            </div>
            <h2 className="mt-4 text-xl font-bold text-center">{memberDisplayName}</h2>
            {!isFrontDesk ? (
              <Badge variant="outline" className="mt-2">
                {member.type}
              </Badge>
            ) : null}

            <div className="mt-6 w-full space-y-3">
              {showRecordPaymentAction ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowRecordPaymentModal(true)}
                  disabled={isActionLoading}
                >
                  <BanknoteIcon className="h-4 w-4" />
                  Record Payment
                </Button>
              ) : null}

              {showEditMemberAction ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowEditModal(true)}
                >
                  <Pencil className="h-4 w-4" />
                  Edit Member
                </Button>
              ) : null}

              {showExtendMembershipAction ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block w-full">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowExtendMembershipModal(true)}
                        disabled={!isMembershipExtensionAvailable || isActionLoading}
                      >
                        <CalendarDays className="h-4 w-4" />
                        Extend Membership
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!isMembershipExtensionAvailable ? (
                    <TooltipContent>Member has no active membership.</TooltipContent>
                  ) : null}
                </Tooltip>
              ) : null}

              <RoleGuard role="admin">
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
                      <RefreshCw className="h-4 w-4" />
                      Reactivate
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4" />
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
                    <CreditCard className="h-4 w-4" />
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
                          <CreditCard className="h-4 w-4" />
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
                          <CreditCard className="h-4 w-4" />
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
                    <RefreshCw className="h-4 w-4" />
                    Card Recovered
                  </Button>
                ) : null}

                {cardActionState.showDisabledCardLabel ? (
                  <div className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                    Card permanently disabled
                  </div>
                ) : null}

                {member.slotPlaceholderName ? (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setActiveDialog('release-slot')}
                    disabled={isActionLoading || member.deviceAccessState === 'released'}
                  >
                    <CreditCard className="h-4 w-4" />
                    Release Slot
                  </Button>
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
              {showPtAttendance ? (
                <TabsTrigger value="pt-attendance" className="px-3 py-1.5">
                  PT Attendance
                </TabsTrigger>
              ) : null}
              {showPaymentsTab ? (
                <TabsTrigger value="payments" className="px-3 py-1.5">
                  Payments
                </TabsTrigger>
              ) : null}
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
                  {!isFrontDesk ? (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Membership Type</p>
                      <p className="font-medium">{member.type}</p>
                    </div>
                  ) : null}
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
                    <p className="text-sm text-muted-foreground">Join Date</p>
                    <p className="font-medium">{formatDateInputDisplay(member.joinedAt)}</p>
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

          {showPtAttendance ? (
            <TabsContent value="pt-attendance">
              <MemberPtAttendance memberId={memberId} />
            </TabsContent>
          ) : null}

          {showPaymentsTab ? (
            <TabsContent value="payments">
              <MemberPaymentHistory memberId={memberId} memberEmail={member.email} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

      {showPtAttendance ? <MemberPtSection memberId={memberId} /> : null}

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
        open={activeDialog === 'release-slot'}
        onOpenChange={(open) => setActiveDialog(open ? 'release-slot' : null)}
        title="Release Hik Slot?"
        description={`This will restore slot ${member.slotPlaceholderName} on the Hik device and make it available for reassignment.`}
        confirmLabel="Release Slot"
        cancelLabel="Cancel"
        onConfirm={() => void handleReleaseSlot()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
        variant="destructive"
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

      {lightboxOpen && avatarPhotoUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Member photo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            aria-label="Close photo"
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(false) }}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarPhotoUrl}
            alt="Member photo"
            className="h-[min(85vh,85vw)] w-[min(85vh,85vw)] rounded-xl object-cover shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <EditMemberModal
        member={member}
        open={showEditModal}
        onOpenChange={setShowEditModal}
        requiresApproval={requiresApproval('members.edit')}
      />

      <ExtendMembershipDialog
        member={member}
        open={showExtendMembershipModal}
        onOpenChange={setShowExtendMembershipModal}
        requiresApproval={requiresApproval('members.extendMembership')}
      />

      <RecordMemberPaymentDialog
        member={member}
        open={showRecordPaymentModal}
        onOpenChange={setShowRecordPaymentModal}
        requiresApproval={requiresApproval('members.recordPayment')}
      />
    </div>
  )
}
