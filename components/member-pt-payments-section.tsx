'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dumbbell, ReceiptText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { usePtPayments } from '@/hooks/use-pt-payments'
import { useMemberPtAssignment } from '@/hooks/use-pt-scheduling'
import { toast } from '@/hooks/use-toast'
import { MEMBER_PAYMENT_METHOD_OPTIONS } from '@/lib/member-payments'
import { getDefaultMemberPaymentDate, recordPtPayment } from '@/lib/pt-payments'
import { queryKeys } from '@/lib/query-keys'
import {
  formatPaymentMethodLabel,
  formatRevenueCurrency,
  formatRevenueReportDate,
} from '@/lib/revenue-reports'
import type { MemberPaymentMethod } from '@/types'

type MemberPtPaymentsSectionProps = {
  memberId: string
}

const EMPTY_PAYMENT_METHOD_VALUE = 'none'

function formatOptionalText(value: string | null) {
  return value && value.trim() ? value.trim() : '-'
}

function getAmountInputValue(amount: number | null | undefined) {
  return typeof amount === 'number' ? String(amount) : ''
}

export function MemberPtPaymentsSection({ memberId }: MemberPtPaymentsSectionProps) {
  const queryClient = useQueryClient()
  const { assignment, isLoading: isAssignmentLoading, error: assignmentError } = useMemberPtAssignment(memberId)
  const { payments, isLoading: isPaymentsLoading, error: paymentsError, refetch } = usePtPayments(memberId)
  const [amount, setAmount] = useState('')
  const [monthsCovered, setMonthsCovered] = useState('1')
  const [paymentMethod, setPaymentMethod] = useState<MemberPaymentMethod | ''>('')
  const [paymentDate, setPaymentDate] = useState(() => getDefaultMemberPaymentDate())
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (assignment) {
      setAmount(getAmountInputValue(assignment.ptFee))
    } else {
      setAmount('')
    }
  }, [assignment?.id, assignment?.ptFee])

  const resetForm = () => {
    setAmount(getAmountInputValue(assignment?.ptFee))
    setMonthsCovered('1')
    setPaymentMethod('')
    setPaymentDate(getDefaultMemberPaymentDate())
    setNotes('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!assignment) {
      return
    }

    const parsedAmount = Number(amount)
    const parsedMonthsCovered = Number(monthsCovered)

    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Amount must be a whole number greater than 0.',
        variant: 'destructive',
      })
      return
    }

    if (!Number.isInteger(parsedMonthsCovered) || parsedMonthsCovered <= 0) {
      toast({
        title: 'Invalid months covered',
        description: 'Months covered must be a whole number greater than 0.',
        variant: 'destructive',
      })
      return
    }

    if (!paymentMethod) {
      toast({
        title: 'Payment method required',
        description: 'Select a payment method before recording the PT payment.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      await recordPtPayment({
        memberId,
        assignmentId: assignment.id,
        amount: parsedAmount,
        monthsCovered: parsedMonthsCovered,
        paymentMethod,
        notes,
        paymentDate,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.ptPayments.member(memberId),
      })
      resetForm()
      toast({
        title: 'PT payment recorded',
      })
    } catch (error) {
      toast({
        title: 'PT payment failed',
        description:
          error instanceof Error ? error.message : 'Failed to record the PT payment.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAssignmentLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ReceiptText className="h-5 w-5 text-muted-foreground" />
          <CardTitle>PT Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (assignmentError) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ReceiptText className="h-5 w-5 text-muted-foreground" />
          <CardTitle>PT Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {assignmentError instanceof Error ? assignmentError.message : 'Failed to load the PT assignment.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <ReceiptText className="h-5 w-5 text-muted-foreground" />
        <CardTitle>PT Payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {assignment ? (
          <form className="space-y-4 rounded-lg border p-4" onSubmit={handleSubmit}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Dumbbell className="h-4 w-4" />
              <span>{assignment.trainerName ?? 'Unknown trainer'}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="pt-payment-amount">Amount (JMD)</Label>
                <Input
                  id="pt-payment-amount"
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pt-payment-months-covered">Months Covered</Label>
                <Input
                  id="pt-payment-months-covered"
                  type="number"
                  min={1}
                  step={1}
                  value={monthsCovered}
                  onChange={(event) => setMonthsCovered(event.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pt-payment-method">Payment Method</Label>
                <Select
                  value={paymentMethod || EMPTY_PAYMENT_METHOD_VALUE}
                  onValueChange={(value) =>
                    setPaymentMethod(
                      value === EMPTY_PAYMENT_METHOD_VALUE ? '' : (value as MemberPaymentMethod),
                    )
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="pt-payment-method">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_PAYMENT_METHOD_VALUE}>
                      Select payment method
                    </SelectItem>
                    {MEMBER_PAYMENT_METHOD_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pt-payment-date">Payment Date</Label>
                <Input
                  id="pt-payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pt-payment-notes">Notes</Label>
              <Textarea
                id="pt-payment-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
              Record PT Payment
            </Button>
          </form>
        ) : (
          <div className="rounded-lg border px-4 py-6 text-sm text-muted-foreground">
            No active PT assignment.
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Trainer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Months Covered</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Recorded By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPaymentsLoading ? (
                Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={`pt-payment-skeleton-${index}`}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  </TableRow>
                ))
              ) : paymentsError ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-destructive">
                        {paymentsError.message || 'Failed to load PT payments.'}
                      </p>
                      <Button type="button" variant="outline" onClick={() => void refetch()}>
                        Retry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No PT payments recorded.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatRevenueReportDate(payment.paymentDate)}</TableCell>
                    <TableCell>{payment.trainerName}</TableCell>
                    <TableCell className="text-right">
                      {formatRevenueCurrency(payment.amount)}
                    </TableCell>
                    <TableCell className="text-right">{payment.monthsCovered}</TableCell>
                    <TableCell>{formatPaymentMethodLabel(payment.paymentMethod)}</TableCell>
                    <TableCell>{formatOptionalText(payment.notes)}</TableCell>
                    <TableCell>{payment.recordedBy}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
