// Member Types
export type MemberType = 'General' | 'Civil Servant' | 'Student/BPO'
export type MemberStatus = 'Active' | 'Expired' | 'Suspended'
export type DeviceAccessState = 'ready' | 'released'
export type MemberGender = 'Male' | 'Female'
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

export type User = {
  id: string
  name: string
  email: string
  role: UserRole
}

// Check-in Types
export type CheckInStatus = 'success' | 'not_found' | 'expired' | 'suspended'

export type CheckInEvent = {
  id: string
  memberId: string
  memberName: string
  status: CheckInStatus
  timestamp: string
}

// Dashboard Types
export type DashboardStats = {
  activeMembers: number
  expiredMembers: number
  checkInsToday: number
}

export type DashboardData = {
  stats: DashboardStats
  recentActivity: CheckInEvent[]
}
