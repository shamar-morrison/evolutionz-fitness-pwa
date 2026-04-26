// Member Types
export type MemberType = 'General' | 'Civil Servant' | 'Student/BPO'
export type MemberStatus = 'Active' | 'Expired' | 'Suspended' | 'Paused'
export type DeviceAccessState = 'ready' | 'released'
export type MemberGender = 'Male' | 'Female'
export type StaffGender = 'male' | 'female' | 'other'
export type CardStatus = 'available' | 'assigned' | 'suspended_lost' | 'disabled'
export type AvailableAccessSlot = {
  employeeNo: string
  cardNo: string
  placeholderName: string
}
export type Card = {
  cardNo: string
  cardCode: string | null
  status: CardStatus
  lostAt: string | null
}
export type AvailableAccessCard = {
  cardNo: string
  cardCode: string | null
}

export type DoorHistoryEvent = {
  cardNo: string
  employeeNo: string | null
  cardCode: string | null
  memberId: string | null
  memberName: string | null
  time: string
  accessGranted: boolean
  doorName: string | null
  eventType: string | null
}

export type DoorHistoryResponse = {
  ok: true
  events: DoorHistoryEvent[]
  fetchedAt: string | null
  totalMatches: number
  cacheDate: string
}

export type MemberTypeRecord = {
  id: string
  name: string
  monthly_rate: number
  is_active: boolean
  created_at: string
}

export type MembershipExpiryEmailLastRunStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'partial'
  | 'failed'

export type MembershipExpiryEmailLastRun = {
  status: MembershipExpiryEmailLastRunStatus
  startedAt: string | null
  completedAt: string | null
  sentCount: number
  skippedCount: number
  duplicateCount: number
  errorCount: number
  message: string | null
}

export type MembershipExpiryEmailSettings = {
  enabled: boolean
  dayOffsets: number[]
  subjectTemplate: string
  bodyTemplate: string
  lastRun: MembershipExpiryEmailLastRun | null
}

export type CardFeeSettings = {
  amountJmd: number
}

export type MemberPaymentMethod = 'cash' | 'fygaro' | 'bank_transfer' | 'point_of_sale'
export type MemberPaymentType = 'membership' | 'card_fee'
export type MemberApprovalRequestStatus = 'pending' | 'approved' | 'denied'
export type MemberExtensionRequestStatus = 'pending' | 'approved' | 'rejected'
export type MemberPauseRequestStatus = 'pending' | 'approved' | 'rejected'
export type MemberPauseStatus = 'active' | 'resumed' | 'cancelled'

export type MemberPayment = {
  id: string
  member_id: string
  member_type_id: string | null
  payment_type: MemberPaymentType
  payment_method: MemberPaymentMethod
  amount_paid: number
  promotion: string | null
  recorded_by: string | null
  payment_date: string
  notes: string | null
  receipt_number: string | null
  receipt_sent_at: string | null
  membership_begin_time: string | null
  membership_end_time: string | null
  created_at: string
}

export type MemberPaymentHistoryItem = {
  id: string
  memberId: string
  memberTypeId: string | null
  memberTypeName: string | null
  paymentType: MemberPaymentType
  paymentMethod: MemberPaymentMethod
  amountPaid: number
  promotion: string | null
  recordedBy: string | null
  recordedByName: string | null
  paymentDate: string
  notes: string | null
  receiptNumber: string | null
  receiptSentAt: string | null
  createdAt: string
}

export type MemberPaymentHistoryResponse = {
  payments: MemberPaymentHistoryItem[]
  totalMatches: number
}

export type MemberApprovalRequest = {
  id: string
  name: string
  gender: MemberGender | null
  email: string | null
  phone: string | null
  remark: string | null
  joinedAt: string | null
  beginTime: string
  endTime: string
  cardNo: string
  cardCode: string
  memberTypeId: string
  memberTypeName: string
  photoUrl: string | null
  status: MemberApprovalRequestStatus
  submittedBy: string
  submittedByName: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  memberId: string | null
  createdAt: string
  updatedAt: string
}

export type MemberEditRequest = {
  id: string
  memberId: string
  memberName: string
  currentName: string
  currentGender: MemberGender | null
  currentPhone: string | null
  currentEmail: string | null
  currentMemberTypeId: string | null
  currentMemberTypeName: string | null
  currentJoinDate: string | null
  currentBeginTime: string | null
  currentEndTime: string | null
  proposedName: string | null
  proposedGender: MemberGender | null
  proposedPhone: string | null
  proposedEmail: string | null
  proposedMemberTypeId: string | null
  proposedMemberTypeName: string | null
  proposedJoinDate: string | null
  proposedStartDate: string | null
  proposedStartTime: string | null
  proposedDuration: string | null
  requestedBy: string
  requestedByName: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  status: MemberApprovalRequestStatus
  createdAt: string
  updatedAt: string
}

export type MemberPaymentRequest = {
  id: string
  memberId: string
  memberName: string
  memberEmail: string | null
  amount: number
  paymentType: MemberPaymentType
  paymentMethod: MemberPaymentMethod
  paymentDate: string
  memberTypeId: string | null
  memberTypeName: string | null
  notes: string | null
  requestedBy: string
  requestedByName: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  status: MemberApprovalRequestStatus
  createdAt: string
  updatedAt: string
}

export type MemberExtensionRequest = {
  id: string
  memberId: string
  memberName: string
  currentEndTime: string | null
  currentStatus: MemberStatus | null
  durationDays: number
  status: MemberExtensionRequestStatus
  requestedBy: string
  requestedByName: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
}

export type MemberPauseRequest = {
  id: string
  memberId: string
  memberName: string
  currentEndTime: string | null
  currentStatus: MemberStatus | null
  durationDays: number
  plannedResumeDate: string
  status: MemberPauseRequestStatus
  requestedBy: string
  requestedByName: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
}

export type MemberPauseResumeRequest = {
  id: string
  pauseId: string
  memberId: string
  memberName: string
  pauseStartDate: string
  plannedResumeDate: string
  originalEndTime: string
  status: MemberPauseRequestStatus
  requestedBy: string
  requestedByName: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
}

export type MemberActivePause = {
  id: string
  pauseStartDate: string
  plannedResumeDate: string
  originalEndTime: string
  status: Extract<MemberPauseStatus, 'active'>
  pendingEarlyResumeRequest: {
    id: string
    status: MemberPauseRequestStatus
  } | null
}

export type Member = {
  id: string
  employeeNo: string
  name: string
  cardNo: string | null
  cardCode: string | null
  cardStatus: CardStatus | null
  cardLostAt: string | null
  slotPlaceholderName?: string
  type: MemberType
  memberTypeId: string | null
  status: MemberStatus
  deviceAccessState: DeviceAccessState
  gender: MemberGender | null
  email: string | null
  phone: string | null
  remark: string | null
  photoUrl: string | null
  joinedAt: string | null
  beginTime: string | null // ISO date string
  endTime: string | null // ISO date string
  hasRecordedPayment?: boolean
  activePause?: MemberActivePause | null
}

export type MemberRecord = {
  id: string
  employee_no: string
  name: string
  card_no: string | null
  type: MemberType
  member_type_id: string | null
  status: MemberStatus
  gender: MemberGender | null
  email: string | null
  phone: string | null
  remark: string | null
  photo_url: string | null
  joined_at: string | null
  begin_time: string | null
  end_time: string | null
  updated_at: string
}

export type CardRecord = {
  card_no: string
  card_code: string | null
  status: CardStatus
  lost_at: string | null
}

export type MemberSyncSummary = {
  membersAdded: number
  membersUpdated: number
}

// User & Auth Types
export type UserRole = 'admin' | 'staff'

export type Profile = {
  id: string
  name: string
  email: string
  role: UserRole
  titles: string[]
  isSuspended: boolean
  phone: string | null
  gender: StaffGender | null
  remark: string | null
  specialties: string[]
  photoUrl: string | null
  archivedAt: string | null
  created_at: string
}

// Group Classes Types
export type GuestProfile = {
  id: string
  name: string
  phone: string | null
  email: string | null
  remark: string | null
  created_at: string
}

export type Class = {
  id: string
  name: string
  schedule_description: string
  per_session_fee: number | null
  monthly_fee: number | null
  trainer_compensation_pct: number
  current_period_start: string | null
  created_at: string
}

export type ClassTrainer = {
  class_id: string
  profile_id: string
  created_at: string
}

export type ClassRegistrationFeeType = 'monthly' | 'per_session' | 'custom'
export type ClassRegistrationRequestStatus = 'pending' | 'approved' | 'rejected'

export type ClassRegistration = {
  id: string
  class_id: string
  member_id: string | null
  guest_profile_id: string | null
  month_start: string
  status: 'pending' | 'approved' | 'denied'
  fee_type: ClassRegistrationFeeType | null
  amount_paid: number
  payment_recorded_at: string | null
  notes: string | null
  receipt_number: string | null
  receipt_sent_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

export type ClassScheduleRuleDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type ClassScheduleRule = {
  id: string
  class_id: string
  day_of_week: ClassScheduleRuleDay
  session_time: string
  created_at: string
}

export type ClassSession = {
  id: string
  class_id: string
  scheduled_at: string
  period_start: string
  created_at: string
}

export type ClassAttendance = {
  id: string
  session_id: string
  member_id: string | null
  guest_profile_id: string | null
  marked_by: string | null
  marked_at: string | null
  created_at: string
}

export type ClassSessionSummary = ClassSession & {
  marked_count: number
  total_count: number
}

export type ClassAttendanceListItem = ClassAttendance & {
  registrant_name: string
  registrant_type: 'member' | 'guest'
}

export type ClassRegistrationEditRequest = {
  id: string
  registrationId: string
  classId: string
  className: string
  memberId: string | null
  guestProfileId: string | null
  registrantName: string
  registrantEmail: string | null
  currentFeeType: ClassRegistrationFeeType | null
  currentAmountPaid: number
  currentPeriodStart: string
  currentPaymentReceived: boolean
  currentNotes: string | null
  proposedFeeType: ClassRegistrationFeeType | null
  proposedAmountPaid: number
  proposedPeriodStart: string
  proposedPaymentReceived: boolean
  proposedNotes: string | null
  requestedBy: string
  requestedByName: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  status: ClassRegistrationRequestStatus
  createdAt: string
}

export type ClassRegistrationRemovalRequest = {
  id: string
  registrationId: string
  classId: string
  className: string
  memberId: string | null
  guestProfileId: string | null
  registrantName: string
  registrantEmail: string | null
  amountPaidAtRequest: number
  requestedBy: string
  requestedByName: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  status: ClassRegistrationRequestStatus
  createdAt: string
}

// Dashboard Types
export type DashboardSignupsByMonthItem = {
  month: string
  count: number
}

export type DashboardMembershipStats = {
  activeMembers: number
  activeMembersLastMonth: number
  totalExpiredMembers: number
  expiringSoon: number
  signedUpThisMonth: number
  signupsByMonth: DashboardSignupsByMonthItem[]
  expiredThisMonth: number
  expiredThisMonthLastMonth: number
}

export type PendingApprovalCounts = {
  member_approval_requests: number
  member_edit_requests: number
  member_payment_requests: number
  member_extension_requests: number
  member_pause_requests: number
  member_pause_resume_requests: number
  class_registration_edit_requests: number
  class_registration_removal_requests: number
  pt_reschedule_requests: number
  pt_session_update_requests: number
}

export type CheckInStatus = 'success' | 'not_found' | 'expired' | 'suspended'

export type DashboardMemberListItem = {
  id: string
  name: string
  type: MemberType
  status: MemberStatus
  endTime: string | null
}
