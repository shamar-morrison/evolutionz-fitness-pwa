'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type MemberAvatarProps = {
  name: string
  photoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function MemberAvatar({ name, photoUrl, size = 'md', className }: MemberAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false)
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const showPhoto = Boolean(photoUrl) && !hasImageError

  useEffect(() => {
    setHasImageError(false)
  }, [photoUrl])

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground',
        size === 'sm' && 'h-8 w-8 text-xs',
        size === 'md' && 'h-10 w-10 text-sm',
        size === 'lg' && 'h-14 w-14 text-lg',
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={photoUrl ?? undefined}
          alt={`${name} profile photo`}
          className="h-full w-full object-cover"
          onError={() => setHasImageError(true)}
        />
      ) : (
        initials
      )}
    </div>
  )
}
