// Member Types
export type MemberType = 'General' | 'Civil Servant' | 'Student/BPO'
export type MemberStatus = 'Active' | 'Expired' | 'Suspended'
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

export type MemberTypeRecord = {
  id: string
  name: string
  monthly_rate: number
  is_active: boolean
  created_at: string
}

export type MemberPayment = {
  id: string
  member_id: string
  member_type_id: string
  payment_method: 'cash' | 'fygaro' | 'bank_transfer' | 'point_of_sale'
  amount_paid: number
  promotion: string | null
  recorded_by: string | null
  payment_date: string
  notes: string | null
  created_at: string
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
  beginTime: string | null // ISO date string
  endTime: string | null // ISO date string
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

export type ClassRegistration = {
  id: string
  class_id: string
  member_id: string | null
  guest_profile_id: string | null
  month_start: string
  status: 'pending' | 'approved' | 'denied'
  amount_paid: number
  payment_recorded_at: string | null
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

// Dashboard Types
export type DashboardMembershipStats = {
  activeMembers: number
  expiredMembers: number
  expiringSoon: number
}

export type CheckInStatus = 'success' | 'not_found' | 'expired' | 'suspended'

export type DashboardMemberListItem = {
  id: string
  name: string
  type: MemberType
  status: MemberStatus
  endTime: string | null
}
