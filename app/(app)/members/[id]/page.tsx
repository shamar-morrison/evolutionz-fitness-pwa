'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMember } from '@/hooks/use-members'
import { MemberAvatar } from '@/components/member-avatar'
import { StatusBadge } from '@/components/status-badge'
import { CheckInHistory } from '@/components/check-in-history'
import { EditMemberModal } from '@/components/edit-member-modal'
import { RoleGuard } from '@/components/role-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import { suspendMember, reactivateMember, revokeCardAccess, retryMemberCard } from '@/lib/member-actions'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, Pencil, Ban, RefreshCw, CreditCard, User } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-JM', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: 0,
  }).format(amount)
}

export default function MemberDetailPage() {
  const params = useParams()
  const router = useRouter()
  const memberId = params.id as string
  const { member, isLoading, error } = useMember(memberId)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)

  const handleSuspendToggle = async () => {
    if (!member) return
    setIsActionLoading(true)
    try {
      if (member.status === 'Suspended') {
        await reactivateMember(member.id)
      } else {
        await suspendMember(member.id)
      }
      // TODO: Refresh member data
    } catch (error) {
      console.error('Failed to update member status:', error)
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleRevokeAccess = async () => {
    if (!member) return
    setIsActionLoading(true)
    try {
      await revokeCardAccess(member.id)
      // TODO: Refresh member data
    } catch (error) {
      console.error('Failed to revoke card access:', error)
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleRetryCard = async () => {
    if (!member) return
    setIsActionLoading(true)
    try {
      await retryMemberCard(member)
      toast({
        title: 'Card issued',
        description: `${member.name}'s card was issued successfully.`,
      })
    } catch (error) {
      console.error('Failed to retry card issuance:', error)
      toast({
        title: 'Card issuance failed',
        description:
          error instanceof Error ? error.message : 'Failed to issue the card for this member.',
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
        <Button variant="outline" onClick={() => router.push('/members')}>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/members')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Member Details</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Member Profile Card */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6">
            <MemberAvatar name={member.name} size="lg" />
            <h2 className="mt-4 text-xl font-bold">{member.name}</h2>
            <Badge variant="outline" className="mt-2">
              {member.type}
            </Badge>
            <div className="mt-2 flex flex-col items-center gap-2">
              <StatusBadge status={member.status} />
              {member.deviceAccessState === 'card_pending' ? (
                <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25">
                  Card Pending
                </Badge>
              ) : null}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 w-full space-y-3">
              <RoleGuard role="admin">
                {member.deviceAccessState === 'card_pending' ? (
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={handleRetryCard}
                    disabled={isActionLoading}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Retry Card Issuance
                  </Button>
                ) : null}

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
                  onClick={handleSuspendToggle}
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

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full" disabled={isActionLoading}>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Revoke Card Access
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke Card Access?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will immediately disable the member&apos;s card access to the gym.
                        They will not be able to check in until a new card is issued.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRevokeAccess}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Revoke Access
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </RoleGuard>
            </div>
          </CardContent>
        </Card>

        {/* Member Details */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Member Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Card ID</p>
                <p className="font-mono font-medium">{member.cardNo}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Membership Type</p>
                <p className="font-medium">{member.type}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={member.status} />
                  {member.deviceAccessState === 'card_pending' ? (
                    <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25">
                      Card Pending
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Expiry Date</p>
                <p className="font-medium">{formatDate(member.expiry)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Balance</p>
                <p
                  className={cn('font-medium', member.balance > 0 ? 'text-red-600' : 'text-foreground')}
                >
                  {formatCurrency(member.balance)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Member Since</p>
                <p className="font-medium">{formatDate(member.createdAt)}</p>
              </div>
            </div>

            {member.deviceAccessState === 'card_pending' ? (
              <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900">
                This member was created on the device, but their card was not issued successfully.
                Retry card issuance to complete access provisioning.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Check-In History */}
      <CheckInHistory memberId={memberId} />

      {/* Edit Modal */}
      <EditMemberModal
        member={member}
        open={showEditModal}
        onOpenChange={setShowEditModal}
        onSuccess={() => {
          // TODO: Refresh member data
          console.log('Member updated successfully')
        }}
      />
    </div>
  )
}
