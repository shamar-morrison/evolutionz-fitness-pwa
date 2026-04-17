'use client'

import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { JAMAICA_OFFSET, JAMAICA_TIME_ZONE } from '@/lib/jamaica-time'
import { cn } from '@/lib/utils'
import type { DashboardSignupsByMonthItem } from '@/types'

type DashboardSignupsChartCardProps = {
  signupsByMonth: DashboardSignupsByMonthItem[]
  currentMonthCount: number
  href: string
}

const chartConfig = {
  signups: {
    label: 'Signups',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig

function formatDashboardMonthLabel(value: string, month: 'short' | 'long') {
  const date = new Date(`${value}-01T12:00:00${JAMAICA_OFFSET}`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    month,
    ...(month === 'long' ? { year: 'numeric' as const } : {}),
  }).format(date)
}

export function DashboardSignupsChartCard({
  signupsByMonth,
  currentMonthCount,
  href,
}: DashboardSignupsChartCardProps) {
  const chartData = signupsByMonth.map((item) => ({
    month: item.month,
    monthLabel: formatDashboardMonthLabel(item.month, 'short'),
    count: item.count,
  }))

  return (
    <Link
      data-progress
      href={href}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card
        className={cn(
          'gap-0 h-full transition-all group-hover:border-primary/40 group-hover:shadow-md group-focus-visible:border-primary/40 group-focus-visible:shadow-md',
        )}
      >
        <CardHeader className="pb-3">
          <div className="space-y-1">
            <CardTitle>Member Signups (Last 6 Months)</CardTitle>
            <p className="text-sm text-muted-foreground">
              {currentMonthCount.toLocaleString()} this month
            </p>
          </div>
          <CardAction>
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
            <BarChart accessibilityLayer data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="monthLabel"
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      formatDashboardMonthLabel(String(payload?.[0]?.payload?.month ?? ''), 'long')
                    }
                  />
                }
              />
              <Bar
                dataKey="count"
                name="signups"
                fill="var(--color-signups)"
                maxBarSize={48}
                radius={[10, 10, 4, 4]}
                animationDuration={350}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </Link>
  )
}
