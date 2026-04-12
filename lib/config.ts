export const config = {
  features: {
    /**
     * Whether to show the "Sync Members" button.
     * Default: true in development, false in other environments.
     */
    showSyncMembersButton: process.env.NODE_ENV === 'development',
    /**
     * Whether to show the "Sync Cards" button for eligible users.
     * Default: true in all environments.
     */
    showSyncCardsButton: true,
  },
} as const
