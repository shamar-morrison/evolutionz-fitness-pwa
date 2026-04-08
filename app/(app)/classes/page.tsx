'use client'

import Link from 'next/link'
import { useClasses } from '@/hooks/use-classes'
import { formatClassDate, formatOptionalJmd } from '@/lib/classes'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function ClassSummaryRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export default function ClassesPage() {
  const { classes, isLoading, error } = useClasses()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Classes</h1>
        <p className="text-sm text-muted-foreground">
          Review the current class setup, trainer assignments, and billing period state.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load classes.'}
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-72 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {classes.map((classItem) => (
            <Card key={classItem.id} className="h-full">
              <CardHeader>
                <CardTitle>{classItem.name}</CardTitle>
                <CardDescription>{classItem.schedule_description}</CardDescription>
                <CardAction>
                  <Button asChild variant="outline" size="sm">
                    <Link data-progress href={`/classes/${classItem.id}`}>
                      View
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                <ClassSummaryRow
                  label="Monthly fee"
                  value={formatOptionalJmd(classItem.monthly_fee)}
                />
                <ClassSummaryRow
                  label="Per session fee"
                  value={formatOptionalJmd(classItem.per_session_fee)}
                />
                <ClassSummaryRow
                  label="Trainer compensation"
                  value={`${classItem.trainer_compensation_pct}%`}
                />
                <ClassSummaryRow
                  label="Trainers"
                  value={
                    classItem.trainers.length > 0
                      ? classItem.trainers.map((trainer) => trainer.name).join(', ')
                      : 'No trainers assigned'
                  }
                />
                <ClassSummaryRow
                  label="Current period start"
                  value={formatClassDate(classItem.current_period_start)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
