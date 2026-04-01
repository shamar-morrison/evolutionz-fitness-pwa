import { describe, expect, it } from 'vitest'
import { getMemberCardActionState } from '@/lib/member-card-action-state'

describe('member card action state', () => {
  it('shows unassign and report lost for assigned cards', () => {
    expect(
      getMemberCardActionState({
        cardNo: '0102857149',
        cardStatus: 'assigned',
      }),
    ).toEqual({
      showUnassignCard: true,
      disableUnassignCard: false,
      showReportCardLost: true,
      disableReportCardLost: false,
      showRecoverCard: false,
      showDisabledCardLabel: false,
    })
  })

  it('shows recovery only for suspended lost cards', () => {
    expect(
      getMemberCardActionState({
        cardNo: '0102857149',
        cardStatus: 'suspended_lost',
      }),
    ).toEqual({
      showUnassignCard: false,
      disableUnassignCard: false,
      showReportCardLost: false,
      disableReportCardLost: false,
      showRecoverCard: true,
      showDisabledCardLabel: false,
    })
  })

  it('shows a disabled label for permanently disabled cards', () => {
    expect(
      getMemberCardActionState({
        cardNo: '0102857149',
        cardStatus: 'disabled',
      }),
    ).toEqual({
      showUnassignCard: false,
      disableUnassignCard: false,
      showReportCardLost: false,
      disableReportCardLost: false,
      showRecoverCard: false,
      showDisabledCardLabel: true,
    })
  })

  it('shows disabled unassign and lost actions when no card is assigned', () => {
    expect(
      getMemberCardActionState({
        cardNo: null,
        cardStatus: null,
      }),
    ).toEqual({
      showUnassignCard: true,
      disableUnassignCard: true,
      showReportCardLost: true,
      disableReportCardLost: true,
      showRecoverCard: false,
      showDisabledCardLabel: false,
    })
  })
})
