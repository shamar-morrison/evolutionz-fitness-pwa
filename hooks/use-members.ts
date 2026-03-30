'use client'

import { useState, useEffect, useMemo } from 'react'
import { getSessionMembers, subscribeToSessionMembers } from '@/lib/member-session-store'
import type { Member, MemberStatus, MemberType } from '@/types'

// TODO: Replace with Supabase queries
const MOCK_MEMBERS: Member[] = [
  {
    id: '1',
    name: 'Damion Williams',
    cardNo: 'EF-001234',
    type: 'General',
    status: 'Active',
    deviceAccessState: 'ready',
    expiry: '2025-06-15',
    balance: 0,
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Keisha Brown',
    cardNo: 'EF-001235',
    type: 'Civil Servant',
    status: 'Active',
    deviceAccessState: 'ready',
    expiry: '2025-07-20',
    balance: 2500,
    createdAt: '2024-02-10',
  },
  {
    id: '3',
    name: 'Marcus Thompson',
    cardNo: 'EF-001236',
    type: 'Student/BPO',
    status: 'Expired',
    deviceAccessState: 'ready',
    expiry: '2024-12-01',
    balance: 5000,
    createdAt: '2023-12-01',
  },
  {
    id: '4',
    name: 'Andre Campbell',
    cardNo: 'EF-001237',
    type: 'General',
    status: 'Active',
    deviceAccessState: 'ready',
    expiry: '2025-03-30',
    balance: 0,
    createdAt: '2024-03-30',
  },
  {
    id: '5',
    name: 'Shanique Mighty',
    cardNo: 'EF-001238',
    type: 'General',
    status: 'Active',
    deviceAccessState: 'ready',
    expiry: '2025-08-15',
    balance: 1500,
    createdAt: '2024-04-15',
  },
  {
    id: '6',
    name: 'Robert Grant',
    cardNo: 'EF-001239',
    type: 'Civil Servant',
    status: 'Suspended',
    deviceAccessState: 'ready',
    expiry: '2025-05-10',
    balance: 7500,
    createdAt: '2024-01-20',
  },
  {
    id: '7',
    name: 'Tanesha Morgan',
    cardNo: 'EF-001240',
    type: 'Student/BPO',
    status: 'Active',
    deviceAccessState: 'ready',
    expiry: '2025-09-01',
    balance: 0,
    createdAt: '2024-05-01',
  },
  {
    id: '8',
    name: 'Michael Reid',
    cardNo: 'EF-001241',
    type: 'General',
    status: 'Expired',
    deviceAccessState: 'ready',
    expiry: '2024-10-15',
    balance: 3000,
    createdAt: '2023-10-15',
  },
  {
    id: '9',
    name: 'Sashane Henry',
    cardNo: 'EF-001242',
    type: 'Civil Servant',
    status: 'Active',
    deviceAccessState: 'ready',
    expiry: '2025-11-20',
    balance: 0,
    createdAt: '2024-06-20',
  },
  {
    id: '10',
    name: 'Daniel Ferguson',
    cardNo: 'EF-001243',
    type: 'General',
    status: 'Active',
    deviceAccessState: 'ready',
    expiry: '2025-04-10',
    balance: 500,
    createdAt: '2024-04-10',
  },
]

type UseMembersOptions = {
  search?: string
  status?: MemberStatus | 'All'
  type?: MemberType | 'All'
}

function mergeMembers(...memberGroups: Member[][]) {
  const merged: Member[] = []
  const seenMemberIds = new Set<string>()

  for (const members of memberGroups) {
    for (const member of members) {
      if (seenMemberIds.has(member.id)) {
        continue
      }

      seenMemberIds.add(member.id)
      merged.push(member)
    }
  }

  return merged
}

export function useMembers(options: UseMembersOptions = {}) {
  const [members, setMembers] = useState<Member[]>([])
  const [sessionMembers, setSessionMembers] = useState<Member[]>(() => getSessionMembers())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // TODO: Replace with Supabase query
    const fetchMembers = async () => {
      setIsLoading(true)
      try {
        await new Promise((resolve) => setTimeout(resolve, 400))
        setMembers(MOCK_MEMBERS)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch members'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchMembers()
  }, [])

  useEffect(() => subscribeToSessionMembers(setSessionMembers), [])

  const mergedMembers = useMemo(() => mergeMembers(sessionMembers, members), [members, sessionMembers])

  const filteredMembers = useMemo(() => {
    let result = mergedMembers

    // Search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase()
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(searchLower) ||
          m.cardNo.toLowerCase().includes(searchLower)
      )
    }

    // Status filter
    if (options.status && options.status !== 'All') {
      result = result.filter((m) => m.status === options.status)
    }

    // Type filter
    if (options.type && options.type !== 'All') {
      result = result.filter((m) => m.type === options.type)
    }

    return result
  }, [mergedMembers, options.search, options.status, options.type])

  return { members: filteredMembers, isLoading, error }
}

export function useMember(id: string) {
  const [member, setMember] = useState<Member | null>(null)
  const [sessionMembers, setSessionMembers] = useState<Member[]>(() => getSessionMembers())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => subscribeToSessionMembers(setSessionMembers), [])

  useEffect(() => {
    // TODO: Replace with Supabase query
    const fetchMember = async () => {
      setIsLoading(true)
      try {
        await new Promise((resolve) => setTimeout(resolve, 300))
        const found = mergeMembers(sessionMembers, MOCK_MEMBERS).find((m) => m.id === id)
        if (!found) {
          throw new Error('Member not found')
        }
        setMember(found)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch member'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchMember()
  }, [id, sessionMembers])

  return { member, isLoading, error }
}
