'use client'

import { useState, useEffect, useMemo } from 'react'
import { fetchMember as fetchPersistedMember, fetchMembers as fetchPersistedMembers } from '@/lib/members'
import { getSessionMembers, subscribeToSessionMembers } from '@/lib/member-session-store'
import type { Member, MemberStatus, MemberType } from '@/types'

type UseMembersOptions = {
  search?: string
  status?: MemberStatus | 'All'
  type?: MemberType | 'All'
}

function normalizeSearchValue(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function getMemberIdentity(member: Partial<Member>) {
  if (typeof member.employeeNo === 'string' && member.employeeNo.trim()) {
    return member.employeeNo.trim()
  }

  return typeof member.id === 'string' ? member.id.trim() : ''
}

function mergeMembers(...memberGroups: Member[][]) {
  const merged: Member[] = []
  const seenMemberIds = new Set<string>()

  for (const members of memberGroups) {
    for (const member of members) {
      const memberIdentity = getMemberIdentity(member)

      if (!memberIdentity || seenMemberIds.has(memberIdentity)) {
        continue
      }

      seenMemberIds.add(memberIdentity)
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

  useEffect(() => subscribeToSessionMembers(setSessionMembers), [])

  const mergedMembers = useMemo(() => mergeMembers(sessionMembers, members), [members, sessionMembers])

  const filteredMembers = useMemo(() => {
    let result = mergedMembers

    if (options.search) {
      const searchLower = options.search.toLowerCase()
      result = result.filter(
        (member) =>
          normalizeSearchValue(member.name).includes(searchLower) ||
          normalizeSearchValue(member.cardNo).includes(searchLower) ||
          normalizeSearchValue(member.employeeNo).includes(searchLower)
      )
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
  const [sessionMembers, setSessionMembers] = useState<Member[]>(() => getSessionMembers())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => subscribeToSessionMembers(setSessionMembers), [])

  const sessionMember = useMemo(
    () =>
      sessionMembers.find(
        (candidate) => candidate.id === id || candidate.employeeNo === id,
      ) ?? null,
    [id, sessionMembers],
  )

  useEffect(() => {
    if (sessionMember) {
      setMember(sessionMember)
      setError(null)
      setIsLoading(false)
      return
    }

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
  }, [id, sessionMember])

  return { member: sessionMember ?? member, isLoading, error }
}
