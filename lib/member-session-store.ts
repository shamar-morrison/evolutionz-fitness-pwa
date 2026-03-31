import type { Member } from '@/types'

const SESSION_MEMBERS_STORAGE_KEY = 'evolutionz-session-members'

let sessionMembers: Member[] = []
let hasLoadedFromStorage = false

const listeners = new Set<(members: Member[]) => void>()

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStoredMember(value: unknown): Member | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<Member>
  const id = normalizeText(candidate.id)
  const employeeNo = normalizeText(candidate.employeeNo) || id
  const name = normalizeText(candidate.name)

  if (!id || !employeeNo || !name) {
    return null
  }

  return {
    id,
    employeeNo,
    name,
    cardNo: normalizeText(candidate.cardNo),
    ...(normalizeText(candidate.slotPlaceholderName)
      ? { slotPlaceholderName: normalizeText(candidate.slotPlaceholderName) }
      : {}),
    type:
      candidate.type === 'Civil Servant' ||
      candidate.type === 'Student/BPO' ||
      candidate.type === 'General'
        ? candidate.type
        : 'General',
    status:
      candidate.status === 'Expired' ||
      candidate.status === 'Suspended' ||
      candidate.status === 'Active'
        ? candidate.status
        : 'Active',
    deviceAccessState: candidate.deviceAccessState === 'released' ? 'released' : 'ready',
    expiry: normalizeText(candidate.expiry) || null,
    balance:
      typeof candidate.balance === 'number' && Number.isFinite(candidate.balance)
        ? candidate.balance
        : 0,
    createdAt: normalizeText(candidate.createdAt) || new Date(0).toISOString(),
  }
}

function getMemberIdentity(member: Partial<Member> | null | undefined) {
  if (!member) {
    return ''
  }

  if (typeof member.employeeNo === 'string' && member.employeeNo.trim()) {
    return member.employeeNo.trim()
  }

  return typeof member.id === 'string' ? member.id.trim() : ''
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
        .map((member) => normalizeStoredMember(member))
        .filter((member): member is Member => member !== null)
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
  const memberIdentity = getMemberIdentity(member)
  const nextMembers = sessionMembers.filter((existingMember) => {
    const existingIdentity = getMemberIdentity(existingMember)

    return existingMember.id !== member.id && existingIdentity !== memberIdentity
  })
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
