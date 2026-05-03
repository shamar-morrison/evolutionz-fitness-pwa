import type { CardStatus } from '@/types'

export type MemberCardActionState = {
  showUnassignCard: boolean
  disableUnassignCard: boolean
  showReportCardLost: boolean
  disableReportCardLost: boolean
  showRecoverCard: boolean
  showDisabledCardLabel: boolean
}

export function getMemberCardActionState({
  cardNo,
  cardStatus,
}: {
  cardNo: string | null
  cardStatus: CardStatus | null
}): MemberCardActionState {
  if (cardStatus === 'assigned' && cardNo) {
    return {
      showUnassignCard: true,
      disableUnassignCard: false,
      showReportCardLost: true,
      disableReportCardLost: false,
      showRecoverCard: false,
      showDisabledCardLabel: false,
    }
  }

  if (cardStatus === 'suspended_lost' && cardNo) {
    return {
      showUnassignCard: false,
      disableUnassignCard: false,
      showReportCardLost: false,
      disableReportCardLost: false,
      showRecoverCard: true,
      showDisabledCardLabel: false,
    }
  }

  if ((cardStatus === 'disabled' || cardStatus === 'decommissioned') && cardNo) {
    return {
      showUnassignCard: false,
      disableUnassignCard: false,
      showReportCardLost: false,
      disableReportCardLost: false,
      showRecoverCard: false,
      showDisabledCardLabel: true,
    }
  }

  return {
    showUnassignCard: true,
    disableUnassignCard: true,
    showReportCardLost: true,
    disableReportCardLost: true,
    showRecoverCard: false,
    showDisabledCardLabel: false,
  }
}
