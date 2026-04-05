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
    detail: (id: string) => ['staff', id] as const,
  },
  ptScheduling: {
    assignments: ['pt-assignments'] as const,
    assignment: (id: string) => ['pt-assignments', id] as const,
    sessions: (filters?: Record<string, string>) => ['pt-sessions', filters ?? {}] as const,
    memberAssignment: (memberId: string) => ['pt-assignments', 'member', memberId] as const,
    trainerAssignments: (trainerId: string) => ['pt-assignments', 'trainer', trainerId] as const,
  },
  cards: {
    available: ['cards', 'available'] as const,
  },
} as const
