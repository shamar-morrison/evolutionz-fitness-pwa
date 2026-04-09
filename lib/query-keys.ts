export const queryKeys = {
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
    recentMembers: ['dashboard', 'recent-members'] as const,
    expiringMembers: ['dashboard', 'expiring-members'] as const,
  },
  members: {
    all: ['members', 'all'] as const,
    detail: (id: string) => ['members', 'detail', id] as const,
    events: (id: string, page: number) => ['members', 'events', id, page] as const,
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
  },
  cards: {
    available: ['cards', 'available'] as const,
  },
} as const
