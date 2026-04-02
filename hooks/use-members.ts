'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { fetchMember as fetchPersistedMember, fetchMembers as fetchPersistedMembers } from '@/lib/members'
import { matchesMemberSearch } from '@/lib/member-search'
import { queryKeys } from '@/lib/query-keys'
import {
  applySessionMemberOverride,
  applySessionMemberOverrides,
  getSessionMemberOverrides,
  subscribeToSessionMemberOverrides,
} from '@/lib/member-session-store'
import type { Member, MemberStatus, MemberType } from '@/types'

type UseMembersOptions = {
  search?: string
  status?: MemberStatus | 'All'
  type?: MemberType | 'All'
}

export function useMembers(options: UseMembersOptions = {}) {
  const [sessionMemberOverrides, setSessionMemberOverrides] = useState(() => getSessionMemberOverrides())
  const membersQuery = useQuery({
    queryKey: queryKeys.members.all,
    queryFn: fetchPersistedMembers,
  })

  useEffect(() => subscribeToSessionMemberOverrides(setSessionMemberOverrides), [])

  const mergedMembers = useMemo(
    () => applySessionMemberOverrides(membersQuery.data ?? [], sessionMemberOverrides),
    [membersQuery.data, sessionMemberOverrides],
  )

  const filteredMembers = useMemo(() => {
    let result = mergedMembers

    if (options.search) {
      result = result.filter((member) => matchesMemberSearch(member, options.search ?? ''))
    }

    if (options.status && options.status !== 'All') {
      result = result.filter((member) => member.status === options.status)
    }

    if (options.type && options.type !== 'All') {
      result = result.filter((member) => member.type === options.type)
    }

    return result
  }, [mergedMembers, options.search, options.status, options.type])

  return {
    members: filteredMembers,
    isLoading: membersQuery.isLoading,
    error: membersQuery.error ?? null,
    refetch: () => membersQuery.refetch(),
  }
}

export function useMember(id: string) {
  const [sessionMemberOverrides, setSessionMemberOverrides] = useState(() => getSessionMemberOverrides())
  const memberQuery = useQuery({
    queryKey: queryKeys.members.detail(id),
    queryFn: () => fetchPersistedMember(id),
    enabled: Boolean(id),
  })

  useEffect(() => subscribeToSessionMemberOverrides(setSessionMemberOverrides), [])

  const mergedMember = useMemo(() => {
    if (!memberQuery.data) {
      return null
    }

    return applySessionMemberOverride(memberQuery.data, sessionMemberOverrides)
  }, [memberQuery.data, sessionMemberOverrides])

  return {
    member: mergedMember,
    isLoading: id ? memberQuery.isLoading : false,
    error: memberQuery.error ?? null,
    refetch: () => memberQuery.refetch(),
  }
}
