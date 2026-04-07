'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Users, UserPlus } from 'lucide-react'
import { AddStaffModal } from '@/components/add-staff-modal'
import { MemberAvatar } from '@/components/member-avatar'
import { RoleGuard } from '@/components/role-guard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStaff } from '@/hooks/use-staff'
import {
  STAFF_TITLES,
  filterStaffByTitle,
  formatStaffTitles,
  type StaffListFilter,
} from '@/lib/staff'

const staffTabs: StaffListFilter[] = ['All', ...STAFF_TITLES]

function StaffListLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="staff-list-loading">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-36 w-full" />
      ))}
    </div>
  )
}

function StaffPageContent() {
  const [activeView, setActiveView] = useState<'active' | 'archived'>('active')
  const [activeTab, setActiveTab] = useState<StaffListFilter>('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const activeStaffQuery = useStaff()
  const archivedStaffQuery = useStaff({ archived: true, enabled: activeView === 'archived' })
  const staff = activeView === 'archived' ? archivedStaffQuery.staff : activeStaffQuery.staff
  const isLoading = activeView === 'archived' ? archivedStaffQuery.isLoading : activeStaffQuery.isLoading
  const error = activeView === 'archived' ? archivedStaffQuery.error : activeStaffQuery.error

  const filteredStaff = useMemo(
    () => filterStaffByTitle(staff, activeTab),
    [activeTab, staff],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
          <p className="text-muted-foreground">Manage staff accounts and admin access.</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <UserPlus className="h-4 w-4" />
          Add Staff
        </Button>
      </div>

      <Tabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as 'active' | 'archived')}
        className="gap-4"
      >
        <TabsList className="w-fit bg-muted/60 p-1">
          <TabsTrigger value="active" className="px-3 py-1.5">
            Active
          </TabsTrigger>
          <TabsTrigger value="archived" className="px-3 py-1.5">
            Archived
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as StaffListFilter)}
        className="gap-4"
      >
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max flex-wrap justify-start gap-1 bg-muted/60 p-1">
            {staffTabs.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="px-3 py-1.5">
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {error ? (
        <div className="flex min-h-56 items-center justify-center rounded-lg border">
          <p className="text-destructive">Failed to load staff</p>
        </div>
      ) : isLoading ? (
        <StaffListLoading />
      ) : filteredStaff.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>
              No {activeView === 'archived' ? 'archived ' : ''}staff in {activeTab}
            </EmptyTitle>
            <EmptyDescription>
              {activeView === 'archived'
                ? activeTab === 'All'
                  ? 'Archived staff accounts will appear here for admin reference.'
                  : `No archived staff members currently use the ${activeTab} title.`
                : activeTab === 'All'
                  ? 'Create the first staff account to start managing access.'
                  : `No staff members currently use the ${activeTab} title.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredStaff.map((profile) => (
            <Link key={profile.id} data-progress href={`/staff/${profile.id}`} className="block">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="flex h-full items-start gap-4">
                  <MemberAvatar
                    name={profile.name}
                    photoUrl={profile.photoUrl}
                    size="lg"
                    className="h-16 w-16 text-xl"
                  />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1">
                      <h2 className="truncate text-lg font-semibold">{profile.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {formatStaffTitles(profile.titles) || 'No title assigned'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.archivedAt ? (
                        <Badge className="bg-amber-600 text-white hover:bg-amber-600">
                          Archived
                        </Badge>
                      ) : null}
                      {profile.titles.length > 0 ? (
                        profile.titles.map((title) => (
                          <Badge key={title} variant="outline">
                            {title}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">Unassigned</Badge>
                      )}
                      <Badge
                        className={
                          profile.role === 'admin'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                            : ''
                        }
                        variant={profile.role === 'admin' ? 'default' : 'outline'}
                      >
                        {profile.role === 'admin' ? 'Admin' : 'Staff'}
                      </Badge>
                    </div>
                    {profile.archivedAt ? (
                      <p className="text-sm text-muted-foreground">
                        Archived {format(new Date(profile.archivedAt), 'MMM d, yyyy h:mm a')}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <AddStaffModal open={showAddModal} onOpenChange={setShowAddModal} />
    </div>
  )
}

export default function StaffPage() {
  return (
    <RoleGuard role="admin">
      <StaffPageContent />
    </RoleGuard>
  )
}
