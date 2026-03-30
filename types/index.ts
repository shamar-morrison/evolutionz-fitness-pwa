// Member Types
export type MemberType = 'General' | 'Civil Servant' | 'Student/BPO'
export type MemberStatus = 'Active' | 'Expired' | 'Suspended'
export type DeviceAccessState = 'ready' | 'released'
export type AvailableAccessSlot = {
  employeeNo: string
  cardNo: string
  placeholderName: string
}

export type Member = {
  id: string
  name: string
  cardNo: string
  slotPlaceholderName?: string
  type: MemberType
  status: MemberStatus
  deviceAccessState: DeviceAccessState
  expiry: string // ISO date string
  balance: number // JMD, amount owed to gym
  createdAt: string
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
