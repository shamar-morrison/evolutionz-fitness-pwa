'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMembers } from '@/hooks/use-members'
import { MembersTable } from '@/components/members-table'
import { AddMemberModal } from '@/components/add-member-modal'
import { RoleGuard } from '@/components/role-guard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/hooks/use-toast'
import { syncMembersFromDevice } from '@/lib/hik-sync'
import { syncAvailableAccessCards } from '@/lib/available-cards'
import { RefreshCw, Search, UserPlus } from 'lucide-react'
import type { MemberStatus, MemberType } from '@/types'

const statusOptions: (MemberStatus | 'All')[] = ['All', 'Active', 'Expired', 'Suspended']
const typeOptions: (MemberType | 'All')[] = ['All', 'General', 'Civil Servant', 'Student/BPO']

function MembersPageLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-5 w-80" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-10 min-w-[200px] max-w-sm flex-1" />
        <Skeleton className="h-10 w-[140px]" />
        <Skeleton className="h-10 w-[160px]" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

function MembersPageContent() {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MemberStatus | 'All'>('All')
  const [typeFilter, setTypeFilter] = useState<MemberType | 'All'>('All')
  const [showAddModal, setShowAddModal] = useState(searchParams.get('action') === 'add')
  const [isSyncingMembers, setIsSyncingMembers] = useState(false)
  const [isSyncingCards, setIsSyncingCards] = useState(false)

  const { members, isLoading, error, refetch } = useMembers({
    search,
    status: statusFilter,
    type: typeFilter,
  })

  const handleSyncMembers = async () => {
    setIsSyncingMembers(true)

    try {
      const summary = await syncMembersFromDevice()

      toast({
        title: 'Members synced',
        description: `Sync complete — ${summary.membersAdded} new members added, ${summary.membersUpdated} members updated.`,
      })
      refetch()
    } catch (syncError) {
      toast({
        title: 'Sync failed',
        description:
          syncError instanceof Error
            ? syncError.message
            : 'Failed to sync members from the device.',
        variant: 'destructive',
      })
    } finally {
      setIsSyncingMembers(false)
    }
  }

  const handleSyncCards = async () => {
    setIsSyncingCards(true)

    try {
      const syncedCards = await syncAvailableAccessCards()

      toast({
        title: 'Cards synced',
        description: `Sync complete — ${syncedCards} cards synced`,
      })
    } catch (syncError) {
      toast({
        title: 'Card sync failed',
        description:
          syncError instanceof Error ? syncError.message : 'Failed to sync cards from the device.',
        variant: 'destructive',
      })
    } finally {
      setIsSyncingCards(false)
    }
  }

  if (error) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-destructive">Failed to load members</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">Manage your gym members and their subscriptions.</p>
        </div>
        <div className="flex items-center gap-2">
          <RoleGuard role="admin">
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSyncCards()}
                disabled={isSyncingCards}
              >
                {isSyncingCards ? <Spinner className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync Cards
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSyncMembers()}
                disabled={isSyncingMembers}
              >
                {isSyncingMembers ? <Spinner className="mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync Members
              </Button>
            </>
          </RoleGuard>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or card ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value: MemberStatus | 'All') => setStatusFilter(value)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={typeFilter}
          onValueChange={(value: MemberType | 'All') => setTypeFilter(value)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Members Table */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <MembersTable members={members} />
      )}

      <AddMemberModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={() => refetch()}
      />
    </div>
  )
}

export default function MembersPage() {
  return (
    <Suspense fallback={<MembersPageLoading />}>
      <MembersPageContent />
    </Suspense>
  )
}
