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
  cards: {
    available: ['cards', 'available'] as const,
  },
} as const
