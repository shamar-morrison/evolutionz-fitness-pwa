'use client'

import { useState, useEffect, useMemo } from 'react'
import { fetchMember as fetchPersistedMember, fetchMembers as fetchPersistedMembers } from '@/lib/members'
import { matchesMemberSearch } from '@/lib/member-search'
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
  const [members, setMembers] = useState<Member[]>([])
  const [sessionMemberOverrides, setSessionMemberOverrides] = useState(() => getSessionMemberOverrides())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let isCancelled = false

    async function loadMembers() {
      setIsLoading(true)
      setError(null)

      try {
        const nextMembers = await fetchPersistedMembers()

        if (!isCancelled) {
          setMembers(nextMembers)
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch members'))
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadMembers()

    return () => {
      isCancelled = true
    }
  }, [refreshToken])

  useEffect(() => subscribeToSessionMemberOverrides(setSessionMemberOverrides), [])

  const mergedMembers = useMemo(
    () => applySessionMemberOverrides(members, sessionMemberOverrides),
    [members, sessionMemberOverrides],
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
    isLoading,
    error,
    refetch: () => setRefreshToken((currentToken) => currentToken + 1),
  }
}

export function useMember(id: string) {
  const [member, setMember] = useState<Member | null>(null)
  const [sessionMemberOverrides, setSessionMemberOverrides] = useState(() => getSessionMemberOverrides())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => subscribeToSessionMemberOverrides(setSessionMemberOverrides), [])

  useEffect(() => {
    let isCancelled = false

    async function loadMember() {
      setIsLoading(true)
      setError(null)

      try {
        const nextMember = await fetchPersistedMember(id)

        if (!isCancelled) {
          setMember(nextMember)
        }
      } catch (err) {
        if (!isCancelled) {
          setMember(null)
          setError(err instanceof Error ? err : new Error('Failed to fetch member'))
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadMember()

    return () => {
      isCancelled = true
    }
  }, [id])

  const mergedMember = useMemo(() => {
    if (!member) {
      return null
    }

    return applySessionMemberOverride(member, sessionMemberOverrides)
  }, [member, sessionMemberOverrides])

  return { member: mergedMember, isLoading, error }
}
