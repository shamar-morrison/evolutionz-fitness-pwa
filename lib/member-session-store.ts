import type { Member } from '@/types'

const SESSION_MEMBERS_STORAGE_KEY = 'evolutionz-session-members'

let sessionMembers: Member[] = []
let hasLoadedFromStorage = false

const listeners = new Set<(members: Member[]) => void>()

function isBrowser() {
  return typeof window !== 'undefined'
}

function ensureLoadedFromStorage() {
  if (!isBrowser() || hasLoadedFromStorage) {
    return
  }

  hasLoadedFromStorage = true

  try {
    const rawValue = window.localStorage.getItem(SESSION_MEMBERS_STORAGE_KEY)

    if (!rawValue) {
      return
    }

    const parsedMembers = JSON.parse(rawValue)

    if (Array.isArray(parsedMembers)) {
      sessionMembers = parsedMembers
    }
  } catch {
    sessionMembers = []
  }
}

function persistToStorage() {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(SESSION_MEMBERS_STORAGE_KEY, JSON.stringify(sessionMembers))
}

function emit() {
  const snapshot = [...sessionMembers]

  for (const listener of listeners) {
    listener(snapshot)
  }
}

export function getSessionMembers() {
  ensureLoadedFromStorage()
  return [...sessionMembers]
}

export function upsertSessionMember(member: Member) {
  ensureLoadedFromStorage()
  const nextMembers = sessionMembers.filter((existingMember) => existingMember.id !== member.id)
  nextMembers.unshift(member)
  sessionMembers = nextMembers
  persistToStorage()
  emit()
}

export function clearSessionMembers() {
  sessionMembers = []
  hasLoadedFromStorage = true

  if (isBrowser()) {
    window.localStorage.removeItem(SESSION_MEMBERS_STORAGE_KEY)
  }

  emit()
}

export function subscribeToSessionMembers(listener: (members: Member[]) => void) {
  ensureLoadedFromStorage()
  listeners.add(listener)
  listener(getSessionMembers())

  return () => {
    listeners.delete(listener)
  }
}
