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
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground',
        size === 'sm' && 'h-8 w-8 text-xs',
        size === 'md' && 'h-10 w-10 text-sm',
        size === 'lg' && 'h-14 w-14 text-lg',
        className
      )}
    >
      {initials}
    </div>
  )
}
