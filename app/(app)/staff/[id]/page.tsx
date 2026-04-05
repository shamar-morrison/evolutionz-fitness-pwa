'use client'

import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Trash2, User } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EditStaffModal } from '@/components/edit-staff-modal'
import { MemberAvatar } from '@/components/member-avatar'
import { RoleGuard } from '@/components/role-guard'
import { TrainerClientsSection } from '@/components/trainer-clients-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useStaffProfile } from '@/hooks/use-staff'
import { toast } from '@/hooks/use-toast'
import { queryKeys } from '@/lib/query-keys'
import { deleteStaff, deleteStaffPhoto } from '@/lib/staff-actions'
import { formatStaffGenderLabel, formatStaffTitles, hasStaffTitle } from '@/lib/staff'
import { useQueryClient } from '@tanstack/react-query'

function formatCreatedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return format(date, 'MMM d, yyyy h:mm a')
}

function StaffDetailPageContent() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const profileId = params.id as string
  const { profile, isLoading, error } = useStaffProfile(profileId)
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [activeDialog, setActiveDialog] = useState<null | 'delete-photo' | 'delete-staff'>(null)

  useEffect(() => {
    setAvatarPhotoUrl(profile?.photoUrl ?? null)
  }, [profile?.photoUrl])

  const invalidateStaffQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.detail(profileId) }),
    ])

  const handleDeletePhoto = async () => {
    if (!profile) {
      return
    }

    setIsActionLoading(true)

    try {
      await deleteStaffPhoto(profile.id)
      setAvatarPhotoUrl(null)
      setActiveDialog(null)
      await invalidateStaffQueries()
      toast({
        title: 'Photo deleted',
        description: `${profile.name}’s photo was removed.`,
      })
    } catch (error) {
      console.error('Failed to delete staff photo:', error)
      toast({
        title: 'Photo deletion failed',
        description:
          error instanceof Error ? error.message : 'Failed to delete this staff photo.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleDeleteStaff = async () => {
    if (!profile) {
      return
    }

    setIsActionLoading(true)

    try {
      const result = await deleteStaff(profile.id)
      setActiveDialog(null)
      await invalidateStaffQueries()
      toast({
        title: 'Staff deleted',
        description: result.warning ?? `${profile.name} was permanently deleted.`,
      })
      router.replace('/staff')
    } catch (error) {
      console.error('Failed to delete staff:', error)
      toast({
        title: 'Staff deletion failed',
        description: error instanceof Error ? error.message : 'Failed to delete this staff member.',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  if (error) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-destructive">Staff profile not found</p>
        <Button variant="outline" onClick={() => router.push('/staff')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Staff
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-72 md:col-span-1" />
          <Skeleton className="h-72 md:col-span-2" />
        </div>
      </div>
    )
  }

  if (!profile) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/staff')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Staff Details</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6">
            <div className="relative">
              <MemberAvatar
                name={profile.name}
                photoUrl={avatarPhotoUrl}
                size="lg"
                className="h-28 w-28 text-2xl"
              />
              {avatarPhotoUrl ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="absolute bottom-0 right-0 z-10 size-8 rounded-full border-2 border-background shadow-sm"
                  onClick={() => setActiveDialog('delete-photo')}
                  disabled={isActionLoading}
                  aria-label="Delete staff photo"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <h2 className="mt-4 text-center text-xl font-bold">{profile.name}</h2>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {profile.titles.length > 0 ? (
                profile.titles.map((title) => (
                  <Badge key={title} variant="outline">
                    {title}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline">No title assigned</Badge>
              )}
            </div>

            <div className="mt-6 w-full space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowEditModal(true)}
                disabled={isActionLoading}
              >
                <Pencil className="h-4 w-4" />
                Edit Staff
              </Button>

              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setActiveDialog('delete-staff')}
                disabled={isActionLoading}
              >
                <Trash2 className="h-4 w-4" />
                Delete Staff
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Staff Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{profile.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{profile.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Titles</p>
                {profile.titles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.titles.map((title) => (
                      <Badge key={title} variant="outline">
                        {title}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="font-medium">Not set</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Role</p>
                <p className="font-medium">{profile.role === 'admin' ? 'Admin' : 'Staff'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{profile.phone ?? 'Not set'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Gender</p>
                <p className="font-medium">{formatStaffGenderLabel(profile.gender)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Remark</p>
                <p className="font-medium">{profile.remark ?? 'Not set'}</p>
              </div>
              {hasStaffTitle(profile.titles, 'Trainer') ? (
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-sm text-muted-foreground">Specialties</p>
                  {profile.specialties.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.specialties.map((specialty) => (
                        <Badge
                          key={specialty}
                          variant="secondary"
                          className="rounded-full px-2.5 py-1"
                        >
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="font-medium">Not set</p>
                  )}
                </div>
              ) : null}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Created At</p>
                <p className="font-medium">{formatCreatedAt(profile.created_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {hasStaffTitle(profile.titles, 'Trainer') ? (
        <TrainerClientsSection trainerId={profile.id} />
      ) : null}

      <ConfirmDialog
        open={activeDialog === 'delete-photo'}
        onOpenChange={(open) => setActiveDialog(open ? 'delete-photo' : null)}
        title="Delete staff photo?"
        description="This will permanently delete the staff photo. This action cannot be undone."
        confirmLabel="Delete Photo"
        cancelLabel="Cancel"
        onConfirm={() => void handleDeletePhoto()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
        variant="destructive"
      />

      <ConfirmDialog
        open={activeDialog === 'delete-staff'}
        onOpenChange={(open) => setActiveDialog(open ? 'delete-staff' : null)}
        title="Delete staff account?"
        description="This will permanently delete this staff account. This cannot be undone."
        confirmLabel="Delete Staff"
        cancelLabel="Cancel"
        onConfirm={() => void handleDeleteStaff()}
        onCancel={() => setActiveDialog(null)}
        isLoading={isActionLoading}
        variant="destructive"
      />

      <EditStaffModal profile={profile} open={showEditModal} onOpenChange={setShowEditModal} />
    </div>
  )
}

export default function StaffDetailPage() {
  return (
    <RoleGuard role="admin">
      <StaffDetailPageContent />
    </RoleGuard>
  )
}
