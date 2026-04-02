export const queryKeys = {
  members: {
    all: ['members', 'all'] as const,
    detail: (id: string) => ['members', 'detail', id] as const,
    events: (id: string, page: number) => ['members', 'events', id, page] as const,
  },
  cards: {
    available: ['cards', 'available'] as const,
  },
} as const
