import { describe, expect, it } from 'vitest'
import {
  mapMemberExtensionRequestRecord,
  type MemberExtensionRequestRecord,
} from '@/lib/member-extension-request-records'

function createRequestRecord(
  overrides: Partial<MemberExtensionRequestRecord> = {},
): MemberExtensionRequestRecord {
  return {
    id: overrides.id ?? 'extension-request-1',
    member_id: overrides.member_id ?? 'member-1',
    requested_by: overrides.requested_by ?? 'staff-1',
    duration_days: overrides.duration_days ?? 84,
    status: overrides.status ?? 'pending',
    reviewed_by: overrides.reviewed_by ?? null,
    review_timestamp: overrides.review_timestamp ?? '2026-04-11T12:30:00',
    created_at: overrides.created_at ?? '2026-04-11T10:00:00',
    member:
      overrides.member === undefined
        ? {
            id: 'member-1',
            name: 'Jane Doe',
            status: 'Suspended',
            end_time: '2026-06-30T23:59:59',
          }
        : overrides.member,
    requestedByProfile:
      overrides.requestedByProfile === undefined
        ? {
            name: 'Jordan Staff',
          }
        : overrides.requestedByProfile,
    reviewedByProfile:
      overrides.reviewedByProfile === undefined
        ? {
            name: 'Admin User',
          }
        : overrides.reviewedByProfile,
  }
}

describe('member extension request records', () => {
  it('normalizes timezone-less timestamps as UTC and exposes the member status', () => {
    const request = mapMemberExtensionRequestRecord(createRequestRecord())

    expect(request.currentEndTime).toBe('2026-06-30T23:59:59.000Z')
    expect(request.currentStatus).toBe('Suspended')
    expect(request.reviewedAt).toBe('2026-04-11T12:30:00.000Z')
    expect(request.createdAt).toBe('2026-04-11T10:00:00.000Z')
  })
})
