import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'

type StatTrend = {
  direction: 'up' | 'down' | 'neutral'
  label: string
}

type StatCardProps = {
  title: string
  value: string | number
  icon: LucideIcon
  variant?: 'default' | 'success' | 'warning' | 'destructive'
  href?: string
  trend?: StatTrend | null
  trendTooltip?: string
  details?: ReactNode
  iconClassName?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  variant = 'default',
  href,
  trend,
  trendTooltip,
  details,
  iconClassName,
}: StatCardProps) {
  const TrendIcon =
    trend?.direction === 'up' ? ArrowUpRight : trend?.direction === 'down' ? ArrowDownRight : Minus

  const trendContent = trend ? (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium',
        trend.direction === 'up' && 'text-green-600',
        trend.direction === 'down' && 'text-destructive',
        trend.direction === 'neutral' && 'text-muted-foreground',
      )}
    >
      <TrendIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span>{trend.label}</span>
    </span>
  ) : null

  const trendIndicator =
    trendContent && trendTooltip ? (
      <Tooltip>
        <TooltipTrigger asChild>{trendContent}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="text-pretty">
          <p>{trendTooltip}</p>
        </TooltipContent>
      </Tooltip>
    ) : (
      trendContent
    )

  const card = (
    <Card
      className={cn(
        'gap-2 h-full',
        href &&
          'transition-all group-hover:border-primary/40 group-hover:shadow-md group-focus-visible:border-primary/40 group-focus-visible:shadow-md',
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon
          className={cn(
            'h-5 w-5',
            iconClassName,
            variant === 'default' && 'text-muted-foreground',
            variant === 'success' && 'text-green-500',
            variant === 'warning' && 'text-primary',
            variant === 'destructive' && 'text-destructive'
          )}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-3xl font-bold leading-none">{value}</p>
          {trendIndicator ? <div className="pt-0.5">{trendIndicator}</div> : null}
        </div>
        {details ? <div className="space-y-1 text-xs text-muted-foreground">{details}</div> : null}
      </CardContent>
    </Card>
  )

  if (!href) {
    return card
  }

  return (
    <Link
      data-progress
      href={href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  )
}
