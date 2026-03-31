import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applySessionMemberOverride,
  applySessionMemberOverrides,
  clearSessionMemberOverrides,
  getSessionMemberOverrides,
  upsertSessionMemberOverride,
} from '@/lib/member-session-store'
import type { Member } from '@/types'

function createLocalStorage(initialValues: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialValues))

  return {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key) ?? null : null
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
    removeItem(key: string) {
      storage.delete(key)
    },
  }
}

const persistedMember: Member = {
  id: 'member-1',
  employeeNo: '00000611',
  name: 'Jane Doe',
  cardNo: '0102857149',
  cardCode: 'P42',
  type: 'General',
  status: 'Active',
  deviceAccessState: 'ready',
  expiry: '2026-07-15T23:59:59.000Z',
  balance: 0,
  createdAt: '2026-03-30T14:15:16.000Z',
}

describe('member session override store', () => {
  afterEach(() => {
    clearSessionMemberOverrides()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('applies matching session overrides without resurrecting orphan members', () => {
    const overrides = [
      {
        id: 'member-1',
        employeeNo: '00000611',
        slotPlaceholderName: 'P42',
        deviceAccessState: 'released' as const,
      },
      {
        id: 'missing-member',
        employeeNo: '00000999',
        slotPlaceholderName: 'A18',
        deviceAccessState: 'released' as const,
      },
    ]

    expect(applySessionMemberOverride(persistedMember, overrides)).toEqual({
      ...persistedMember,
      slotPlaceholderName: 'P42',
      deviceAccessState: 'released',
    })

    expect(applySessionMemberOverrides([persistedMember], overrides)).toEqual([
      {
        ...persistedMember,
        slotPlaceholderName: 'P42',
        deviceAccessState: 'released',
      },
    ])
  })

  it('clears legacy cached members on first load', () => {
    const localStorage = createLocalStorage({
      'evolutionz-session-members': JSON.stringify([
        {
          id: 'legacy-member',
          employeeNo: '00000611',
          name: 'John Doe',
          cardNo: '0102857149',
          cardCode: 'JD',
          type: 'General',
          status: 'Active',
          deviceAccessState: 'ready',
          expiry: '2026-07-15',
          balance: 0,
          createdAt: '2026-03-30T14:15:16.000Z',
        },
      ]),
    })

    vi.stubGlobal('window', { localStorage })

    expect(getSessionMemberOverrides()).toEqual([])
    expect(localStorage.getItem('evolutionz-session-members')).toBeNull()
  })

  it('stores override-only session state', () => {
    const localStorage = createLocalStorage()

    vi.stubGlobal('window', { localStorage })

    upsertSessionMemberOverride({
      ...persistedMember,
      slotPlaceholderName: 'P42',
      deviceAccessState: 'released',
    })

    expect(getSessionMemberOverrides()).toEqual([
      {
        id: 'member-1',
        employeeNo: '00000611',
        slotPlaceholderName: 'P42',
        deviceAccessState: 'released',
      },
    ])
    expect(
      JSON.parse(localStorage.getItem('evolutionz-session-member-overrides') ?? 'null'),
    ).toEqual([
      {
        id: 'member-1',
        employeeNo: '00000611',
        slotPlaceholderName: 'P42',
        deviceAccessState: 'released',
      },
    ])
  })
})
