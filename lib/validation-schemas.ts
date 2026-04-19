import { z } from 'zod'

export const durationDaysSchema = z.number().int().positive('Duration is required.')

export const reviewActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
})

export const denyReviewActionSchema = z.object({
  action: z.enum(['approve', 'deny']),
})

export const paymentMethodSchema = z.enum([
  'cash',
  'fygaro',
  'bank_transfer',
  'point_of_sale',
])
