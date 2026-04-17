import { describe, expect, it, vi } from 'vitest'

const { createAndWaitForAccessControlJobMock } = vi.hoisted(() => ({
  createAndWaitForAccessControlJobMock: vi.fn(),
}))

vi.mock('@/lib/access-control-jobs', () => ({
  createAndWaitForAccessControlJob: createAndWaitForAccessControlJobMock,
}))

import {
  MEMBER_EXTENSION_NO_BEGIN_TIME_WARNING,
  syncPreparedMemberExtensionAccessWindow,
} from '@/lib/member-extension-server'
import type { Member } from '@/types'

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? 'member-1',
    employeeNo: overrides.employeeNo ?? 'EMP001',
    name: overrides.name ?? 'Jane Doe',
    cardNo: overrides.cardNo ?? null,
    cardCode: overrides.cardCode ?? null,
    cardStatus: overrides.cardStatus ?? null,
    cardLostAt: overrides.cardLostAt ?? null,
    type: overrides.type ?? 'General',
    memberTypeId: overrides.memberTypeId ?? null,
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? null,
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    joinedAt: overrides.joinedAt ?? null,
    beginTime: overrides.beginTime ?? null,
    endTime: overrides.endTime ?? '2026-06-30T23:59:59.000Z',
  }
}

describe('member extension server', () => {
  it('returns a dedicated warning when the member begin time is missing', async () => {
    const result = await syncPreparedMemberExtensionAccessWindow(
      {
        member: createMember({
          beginTime: null,
        }),
        newEndTime: '2026-09-22T23:59:59',
      },
      {} as never,
    )

    expect(createAndWaitForAccessControlJobMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      newEndTime: '2026-09-22T23:59:59',
      warning: MEMBER_EXTENSION_NO_BEGIN_TIME_WARNING,
    })
  })
})
