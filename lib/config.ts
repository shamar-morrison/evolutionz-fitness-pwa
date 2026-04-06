export const config = {
  features: {
    /**
     * Whether to show the "Sync Cards" and "Sync Members" buttons.
     * Default: true in development, false in other environments.
     */
    showSyncButtons: process.env.NODE_ENV === 'development',
  },
} as const
