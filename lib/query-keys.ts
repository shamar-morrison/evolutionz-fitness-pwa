export const queryKeys = {
  email: {
    quota: ['email', 'quota'] as const,
  },
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
    recentMembers: ['dashboard', 'recent-members'] as const,
    expiringMembers: ['dashboard', 'expiring-members'] as const,
  },
  pendingApprovalCounts: {
    all: ['pending-approval-counts'] as const,
  },
  members: {
    all: ['members', 'all'] as const,
    detail: (id: string) => ['members', 'detail', id] as const,
    events: (id: string, page: number) => ['members', 'events', id, page] as const,
  },
  memberPicker: {
    all: ['member-picker'] as const,
    list: (status: string, mode: boolean) =>
      ['member-picker', status, mode ? 'with-email' : 'all-members'] as const,
  },
  memberTypes: {
    all: ['memberTypes'] as const,
  },
  cardFeeSettings: {
    settings: ['cardFeeSettings', 'settings'] as const,
  },
  membershipExpiryEmails: {
    settings: ['membershipExpiryEmails', 'settings'] as const,
  },
  memberApprovalRequests: {
    all: ['memberApprovalRequests'] as const,
    pending: ['memberApprovalRequests', 'pending'] as const,
    status: (status: 'pending' | 'approved' | 'denied') =>
      ['memberApprovalRequests', status] as const,
  },
  memberEditRequests: {
    all: ['memberEditRequests'] as const,
    pending: ['memberEditRequests', 'pending'] as const,
  },
  memberExtensionRequests: {
    all: ['memberExtensionRequests'] as const,
    pending: ['memberExtensionRequests', 'pending'] as const,
  },
  memberPauseRequests: {
    all: ['memberPauseRequests'] as const,
    pending: ['memberPauseRequests', 'pending'] as const,
  },
  memberPayments: {
    all: ['memberPayments'] as const,
    member: (memberId: string) => ['memberPayments', memberId] as const,
    page: (memberId: string, page: number) => ['memberPayments', memberId, page] as const,
  },
  memberPaymentRequests: {
    all: ['memberPaymentRequests'] as const,
    pending: ['memberPaymentRequests', 'pending'] as const,
  },
  classRegistrationRequests: {
    all: ['classRegistrationRequests'] as const,
    pending: ['classRegistrationRequests', 'pending'] as const,
  },
  staff: {
    all: ['staff'] as const,
    archived: ['staff', 'archived'] as const,
    detail: (id: string) => ['staff', id] as const,
  },
  classes: {
    all: ['classes'] as const,
    detail: (id: string) => ['classes', 'detail', id] as const,
    registrations: (classId: string, monthStart: string) =>
      ['classes', 'registrations', classId, monthStart] as const,
    sessions: (classId: string, periodStart: string) =>
      ['classes', 'sessions', classId, periodStart] as const,
    attendance: (sessionId: string) =>
      ['classes', 'attendance', sessionId] as const,
    scheduleRules: (classId: string) =>
      ['classes', 'scheduleRules', classId] as const,
    trainers: (classId: string) => ['classes', 'trainers', classId] as const,
  },
  guestProfiles: {
    all: ['guestProfiles'] as const,
    detail: (id: string) => ['guestProfiles', id] as const,
  },
  ptScheduling: {
    assignments: ['pt-assignments'] as const,
    assignment: (id: string) => ['pt-assignments', id] as const,
    trainingTypes: ['training-types'] as const,
    sessions: (filters?: Record<string, string>) => ['pt-sessions', filters ?? {}] as const,
    memberAssignment: (memberId: string) => ['pt-assignments', 'member', memberId] as const,
    trainerAssignments: (trainerId: string) => ['pt-assignments', 'trainer', trainerId] as const,
  },
  notifications: {
    all: (profileId: string) => ['notifications', profileId] as const,
    archived: (profileId: string) => ['notifications', profileId, 'archived'] as const,
    unreadCount: (profileId: string) => ['notifications', profileId, 'unread-count'] as const,
  },
  rescheduleRequests: {
    all: ['reschedule-requests'] as const,
    pending: ['reschedule-requests', 'pending'] as const,
    mine: (profileId: string) => ['reschedule-requests', 'mine', profileId] as const,
  },
  sessionUpdateRequests: {
    all: ['session-update-requests'] as const,
    pending: ['session-update-requests', 'pending'] as const,
    mine: (profileId: string) => ['session-update-requests', 'mine', profileId] as const,
  },
  reports: {
    ptPayments: (startDate: string, endDate: string) =>
      ['reports', 'pt-payments', startDate, endDate] as const,
    classPayments: (
      startDate: string,
      endDate: string,
      status: 'approved' | 'include-pending',
      includeZero: boolean,
    ) => ['reports', 'class-payments', startDate, endDate, status, includeZero] as const,
    membershipRevenue: (from: string, to: string) =>
      ['reports', 'membership-revenue', from, to] as const,
    cardFeeRevenue: (from: string, to: string) =>
      ['reports', 'card-fee-revenue', from, to] as const,
    memberSignups: (startDate: string, endDate: string) =>
      ['reports', 'member-signups', startDate, endDate] as const,
    memberExpired: (startDate: string, endDate: string) =>
      ['reports', 'member-expired', startDate, endDate] as const,
    ptRevenue: (from: string, to: string) =>
      ['reports', 'pt-revenue', from, to] as const,
    overallRevenue: (from: string, to: string) =>
      ['reports', 'overall-revenue', from, to] as const,
  },
  cards: {
    available: ['cards', 'available'] as const,
    manualCreate: ['cards', 'manual-create'] as const,
  },
  doorHistory: {
    byDate: (date: string) => ['doorHistory', date] as const,
  },
} as const
