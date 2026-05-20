'use client'

import { useQuery } from '@tanstack/react-query'
import { BanknoteIcon, Users, CalendarDays, ClipboardList } from 'lucide-react'
import { StaffOnly } from '@/components/staff-only'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

type CommissionAssignment = {
  id: string
  memberName: string
  commissionRate: number
}

async function fetchTrainerCommission(): Promise<CommissionAssignment[]> {
  const response = await fetch('/api/trainer/commission')
  if (!response.ok) {
    throw new Error('Failed to load commission details')
  }
  const data = await response.json()
  return data.assignments
}

const currencyFormatter = new Intl.NumberFormat('en-JM', {
  style: 'currency',
  currency: 'JMD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function TrainerCommissionContent() {
  const { data: assignments = [], isLoading, error } = useQuery<CommissionAssignment[]>({
    queryKey: ['trainer', 'commission'],
    queryFn: fetchTrainerCommission,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const totalActiveAssignments = assignments.length
  const totalCommission = assignments.reduce((sum, item) => sum + item.commissionRate, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">My Commission</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your earnings breakdown for active client assignments.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-6 py-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <Skeleton className="h-8 w-24 mb-1" />
                <Skeleton className="h-3 w-36" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-6 py-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <Skeleton className="h-8 w-32 mb-1" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
            <Card className="col-span-1 md:col-span-2 lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-6 py-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load commission data.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="relative overflow-hidden border bg-gradient-to-br from-card to-muted/20 py-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-6">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Assignments
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-6">
                <div className="text-3xl font-bold tracking-tight text-foreground">{totalActiveAssignments}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Currently assigned active clients
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border bg-gradient-to-br from-card to-muted/20 py-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-6">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Monthly Earnings
                </CardTitle>
                <BanknoteIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-6">
                <div className="text-3xl font-bold tracking-tight text-primary">
                  {currencyFormatter.format(totalCommission)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sum of active client commissions (JMD)
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 col-span-1 md:col-span-2 lg:col-span-1 flex flex-col justify-between py-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-6">
                <CardTitle className="text-sm font-medium text-primary">
                  Payout Schedule
                </CardTitle>
                <CalendarDays className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-center px-6">
                <div className="flex items-center">
                  <Badge variant="default" className="bg-primary text-primary-foreground font-semibold px-3 py-1 text-sm shadow-sm">
                    Paid on the 28th of each month
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown Table */}
          <Card className="border shadow-sm">
            <CardHeader className="border-b bg-muted/10 px-6 py-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg text-foreground">Commission Breakdown</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Individual earnings breakdown per active client assignment.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {assignments.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No active client assignments found. Commission is calculated based on active client assignments.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-6 py-3 font-semibold text-muted-foreground">Client Name</TableHead>
                      <TableHead className="px-6 py-3 text-right font-semibold text-muted-foreground">Commission Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment) => (
                      <TableRow key={assignment.id} className="hover:bg-muted/30">
                        <TableCell className="px-6 py-4 font-medium text-foreground">
                          {assignment.memberName}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-semibold text-primary">
                          {currencyFormatter.format(assignment.commissionRate)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default function TrainerCommissionPage() {
  return (
    <StaffOnly>
      <TrainerCommissionContent />
    </StaffOnly>
  )
}
