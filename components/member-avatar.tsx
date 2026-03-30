'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type MemberAvatarProps = {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function MemberAvatar({ name, size = 'md', className }: MemberAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Avatar
      className={cn(
        size === 'sm' && 'h-8 w-8',
        size === 'md' && 'h-10 w-10',
        size === 'lg' && 'h-14 w-14',
        className
      )}
    >
      <AvatarFallback
        className={cn(
          'bg-muted font-semibold text-muted-foreground',
          size === 'sm' && 'text-xs',
          size === 'md' && 'text-sm',
          size === 'lg' && 'text-lg'
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
