import type { DeviceAccessState, Member } from '@/types'

const SESSION_MEMBER_OVERRIDES_STORAGE_KEY = 'evolutionz-session-member-overrides'
const LEGACY_SESSION_MEMBERS_STORAGE_KEY = 'evolutionz-session-members'

export type SessionMemberOverride = {
  id: string
  employeeNo: string
  deviceAccessState: DeviceAccessState
  slotPlaceholderName?: string
}

let sessionMemberOverrides: SessionMemberOverride[] = []
let hasLoadedFromStorage = false

const listeners = new Set<(overrides: SessionMemberOverride[]) => void>()

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getMemberIdentity(member: Partial<Pick<Member, 'id' | 'employeeNo'>> | null | undefined) {
  if (!member) {
    return ''
  }

  if (typeof member.employeeNo === 'string' && member.employeeNo.trim()) {
    return member.employeeNo.trim()
  }

  return typeof member.id === 'string' ? member.id.trim() : ''
}

function buildOverrideIdentityMap(overrides: SessionMemberOverride[]) {
  const overridesByIdentity = new Map<string, SessionMemberOverride>()

  for (const override of overrides) {
    const identity = getMemberIdentity(override)

    if (!identity || overridesByIdentity.has(identity)) {
      continue
    }

    overridesByIdentity.set(identity, override)
  }

  return overridesByIdentity
}

function applyOverride(member: Member, override: SessionMemberOverride | null) {
  if (!override) {
    return member
  }

  return {
    ...member,
    deviceAccessState: override.deviceAccessState,
    ...(override.slotPlaceholderName ? { slotPlaceholderName: override.slotPlaceholderName } : {}),
  }
}

function normalizeStoredOverride(value: unknown): SessionMemberOverride | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<SessionMemberOverride>
  const id = normalizeText(candidate.id)
  const employeeNo = normalizeText(candidate.employeeNo) || id

  if (!id || !employeeNo) {
    return null
  }

  const slotPlaceholderName = normalizeText(candidate.slotPlaceholderName)
  const deviceAccessState =
    candidate.deviceAccessState === 'released' ? 'released' : 'ready'

  if (deviceAccessState === 'ready' && !slotPlaceholderName) {
    return null
  }

  return {
    id,
    employeeNo,
    deviceAccessState,
    ...(slotPlaceholderName ? { slotPlaceholderName } : {}),
  }
}

function normalizeMemberOverride(member: Pick<Member, 'id' | 'employeeNo' | 'deviceAccessState' | 'slotPlaceholderName'>) {
  return normalizeStoredOverride({
    id: member.id,
    employeeNo: member.employeeNo,
    deviceAccessState: member.deviceAccessState,
    slotPlaceholderName: member.slotPlaceholderName,
  })
}

function ensureLoadedFromStorage() {
  if (!isBrowser() || hasLoadedFromStorage) {
    return
  }

  hasLoadedFromStorage = true

  try {
    if (window.localStorage.getItem(LEGACY_SESSION_MEMBERS_STORAGE_KEY) !== null) {
      window.localStorage.removeItem(LEGACY_SESSION_MEMBERS_STORAGE_KEY)
    }

    const rawValue = window.localStorage.getItem(SESSION_MEMBER_OVERRIDES_STORAGE_KEY)

    if (!rawValue) {
      return
    }

    const parsedOverrides = JSON.parse(rawValue)

    if (Array.isArray(parsedOverrides)) {
      sessionMemberOverrides = parsedOverrides
        .map((override) => normalizeStoredOverride(override))
        .filter((override): override is SessionMemberOverride => override !== null)
    }
  } catch {
    sessionMemberOverrides = []
  }
}

function persistToStorage() {
  if (!isBrowser()) {
    return
  }

  if (sessionMemberOverrides.length === 0) {
    window.localStorage.removeItem(SESSION_MEMBER_OVERRIDES_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(
    SESSION_MEMBER_OVERRIDES_STORAGE_KEY,
    JSON.stringify(sessionMemberOverrides),
  )
}

function emit() {
  const snapshot = sessionMemberOverrides.map((override) => ({ ...override }))

  for (const listener of listeners) {
    listener(snapshot)
  }
}

export function findSessionMemberOverride(
  member: Partial<Pick<Member, 'id' | 'employeeNo'>>,
  overrides: SessionMemberOverride[],
) {
  const memberIdentity = getMemberIdentity(member)

  if (!memberIdentity) {
    return null
  }

  return buildOverrideIdentityMap(overrides).get(memberIdentity) ?? null
}

export function applySessionMemberOverride(member: Member, overrides: SessionMemberOverride[]) {
  return applyOverride(member, findSessionMemberOverride(member, overrides))
}

export function applySessionMemberOverrides(members: Member[], overrides: SessionMemberOverride[]) {
  if (members.length === 0 || overrides.length === 0) {
    return members
  }

  const overridesByIdentity = buildOverrideIdentityMap(overrides)

  return members.map((member) => {
    const memberIdentity = getMemberIdentity(member)
    return applyOverride(
      member,
      memberIdentity ? overridesByIdentity.get(memberIdentity) ?? null : null,
    )
  })
}

export function getSessionMemberOverrides() {
  ensureLoadedFromStorage()
  return sessionMemberOverrides.map((override) => ({ ...override }))
}

export function upsertSessionMemberOverride(
  member: Pick<Member, 'id' | 'employeeNo' | 'deviceAccessState' | 'slotPlaceholderName'>,
) {
  ensureLoadedFromStorage()
  const nextOverride = normalizeMemberOverride(member)
  const memberIdentity = getMemberIdentity(member)

  if (!memberIdentity) {
    return
  }

  sessionMemberOverrides = sessionMemberOverrides.filter((existingOverride) => {
    return getMemberIdentity(existingOverride) !== memberIdentity
  })

  if (nextOverride) {
    sessionMemberOverrides.unshift(nextOverride)
  }

  persistToStorage()
  emit()
}

export function clearSessionMemberOverrides() {
  sessionMemberOverrides = []
  hasLoadedFromStorage = false

  if (isBrowser()) {
    window.localStorage.removeItem(SESSION_MEMBER_OVERRIDES_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_SESSION_MEMBERS_STORAGE_KEY)
  }

  emit()
}

export function subscribeToSessionMemberOverrides(listener: (overrides: SessionMemberOverride[]) => void) {
  ensureLoadedFromStorage()
  listeners.add(listener)
  listener(getSessionMemberOverrides())

  return () => {
    listeners.delete(listener)
  }
}
