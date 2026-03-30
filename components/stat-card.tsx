import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type StatCardProps = {
  title: string
  value: string | number
  icon: LucideIcon
  variant?: 'default' | 'success' | 'warning' | 'destructive'
}

export function StatCard({ title, value, icon: Icon, variant = 'default' }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon
          className={cn(
            'h-5 w-5',
            variant === 'default' && 'text-muted-foreground',
            variant === 'success' && 'text-green-500',
            variant === 'warning' && 'text-primary',
            variant === 'destructive' && 'text-destructive'
          )}
        />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
