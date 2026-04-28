'use client'

import { useState } from 'react'
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { BarChart3, Download, FileText } from 'lucide-react'
import { useProgressRouter } from '@/hooks/use-progress-router'
import {
  useCardFeeRevenueReport,
  useMembershipRevenueReport,
  useOverallRevenueReport,
  usePtRevenueReport,
} from '@/hooks/use-revenue-reports'
import { toast } from '@/hooks/use-toast'
import {
  type CardFeeRevenueReport,
  type DateRangeValue,
  formatGeneratedTimestamp,
  formatPaymentMethodLabel,
  formatRevenueCurrency,
  formatRevenuePercentage,
  formatRevenueReportDate,
  formatRevenueReportDateTime,
  formatRevenueReportMonth,
  getRevenueDateRangeForPeriod,
  isDateRangeValue,
  type MembershipRevenueReport,
  type OverallRevenueReport,
  type PtRevenueReport,
  REVENUE_PERIOD_OPTIONS,
  type RevenuePeriod,
} from '@/lib/revenue-reports'
import { isDateValue } from '@/lib/pt-scheduling'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { StringDatePicker } from '@/components/ui/string-date-picker'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type RevenueTab = 'membership' | 'card-fees' | 'pt' | 'overall'

function buildReturnTo(pathname: string | null, searchParams: ReadonlyURLSearchParams | null) {
  if (!pathname) {
    return null
  }

  const query = searchParams?.toString() ?? ''

  return query ? `${pathname}?${query}` : pathname
}

function getPdfCursorY(doc: { lastAutoTable?: { finalY: number } }, fallback: number) {
  return (doc.lastAutoTable?.finalY ?? fallback) + 20
}

function addPdfFooter(doc: any, footerLines: string[]) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageCount = doc.getNumberOfPages()

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(90, 90, 90)
    doc.text(footerLines[0], pageWidth / 2, pageHeight - 30, {
      align: 'center',
    })
    doc.text(footerLines[1], pageWidth / 2, pageHeight - 18, {
      align: 'center',
    })
  }
}

async function downloadMembershipRevenuePdf(
  report: MembershipRevenueReport,
  range: DateRangeValue,
) {
  if (typeof window === 'undefined') {
    return
  }

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf/dist/jspdf.es.min.js'),
    import('jspdf-autotable/es'),
  ])
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  })
  const leftMargin = 40
  let cursorY = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text('Evolutionz Fitness — Membership Revenue Report', leftMargin, cursorY)

  cursorY += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(70, 70, 70)
  doc.text(`Period: ${formatRevenueReportDate(range.from)} to ${formatRevenueReportDate(range.to)}`, leftMargin, cursorY)

  cursorY += 16
  doc.text(`Generated: ${formatGeneratedTimestamp()}`, leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 20,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Total Revenue (JMD)', 'Total Payments']],
    body: [[formatRevenueCurrency(report.summary.totalRevenue), String(report.summary.totalPayments)]],
    styles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = getPdfCursorY(doc as any, cursorY)

  autoTable(doc, {
    startY: cursorY,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Member Name', 'Member Type', 'Amount (JMD)', 'Payment Method', 'Date', 'Notes']],
    body:
      report.payments.length > 0
        ? report.payments.map((payment) => [
            payment.memberName,
            payment.memberTypeName,
            formatRevenueCurrency(payment.amount),
            formatPaymentMethodLabel(payment.paymentMethod),
            formatRevenueReportDate(payment.paymentDate),
            payment.notes ?? '',
          ])
        : [['No membership payments found for the selected period.', '', '', '', '', '']],
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = getPdfCursorY(doc as any, cursorY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Totals by Member Type', leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 10,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Member Type', 'Revenue (JMD)', 'Payments']],
    body: report.totalsByMemberType.map((item) => [
      item.memberTypeName,
      formatRevenueCurrency(item.totalRevenue),
      String(item.paymentCount),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = getPdfCursorY(doc as any, cursorY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Totals by Payment Method', leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 10,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Payment Method', 'Revenue (JMD)', 'Payments']],
    body: report.totalsByPaymentMethod.map((item) => [
      formatPaymentMethodLabel(item.paymentMethod),
      formatRevenueCurrency(item.totalRevenue),
      String(item.paymentCount),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  addPdfFooter(doc, [
    `Generated: ${formatGeneratedTimestamp()}`,
    'Evolutionz Fitness — Confidential',
  ])

  doc.save(`revenue-membership-${range.from}-to-${range.to}.pdf`)
}

async function downloadCardFeeRevenuePdf(
  report: CardFeeRevenueReport,
  range: DateRangeValue,
) {
  if (typeof window === 'undefined') {
    return
  }

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf/dist/jspdf.es.min.js'),
    import('jspdf-autotable/es'),
  ])
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  })
  const leftMargin = 40
  let cursorY = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text('Evolutionz Fitness - Card Fee Revenue Report', leftMargin, cursorY)

  cursorY += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(70, 70, 70)
  doc.text(
    `Period: ${formatRevenueReportDate(range.from)} to ${formatRevenueReportDate(range.to)}`,
    leftMargin,
    cursorY,
  )

  cursorY += 16
  doc.text(`Generated: ${formatGeneratedTimestamp()}`, leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 20,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Total Card Fee Revenue (JMD)', 'Card Fee Payments']],
    body: [[formatRevenueCurrency(report.summary.totalRevenue), String(report.summary.totalPayments)]],
    styles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = getPdfCursorY(doc as any, cursorY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Monthly Breakdown', leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 10,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Month', 'Revenue (JMD)', 'Payments']],
    body:
      report.monthlyBreakdown.length > 0
        ? report.monthlyBreakdown.map((item) => [
            formatRevenueReportMonth(item.month),
            formatRevenueCurrency(item.totalRevenue),
            String(item.paymentCount),
          ])
        : [['No card fee totals for the selected period.', '', '']],
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = getPdfCursorY(doc as any, cursorY)

  autoTable(doc, {
    startY: cursorY,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Member Name', 'Amount (JMD)', 'Payment Method', 'Date', 'Notes']],
    body:
      report.payments.length > 0
        ? report.payments.map((payment) => [
            payment.memberName,
            formatRevenueCurrency(payment.amount),
            formatPaymentMethodLabel(payment.paymentMethod),
            formatRevenueReportDate(payment.paymentDate),
            payment.notes ?? '',
          ])
        : [['No card fee payments found for the selected period.', '', '', '', '']],
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  addPdfFooter(doc, [
    `Generated: ${formatGeneratedTimestamp()}`,
    'Evolutionz Fitness - Confidential',
  ])

  doc.save(`revenue-card-fees-${range.from}-to-${range.to}.pdf`)
}

async function downloadPtRevenuePdf(report: PtRevenueReport, range: DateRangeValue) {
  if (typeof window === 'undefined') {
    return
  }

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf/dist/jspdf.es.min.js'),
    import('jspdf-autotable/es'),
  ])
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  })
  const leftMargin = 40
  let cursorY = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text('Evolutionz Fitness — PT Revenue Report', leftMargin, cursorY)

  cursorY += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(70, 70, 70)
  doc.text(`Period: ${formatRevenueReportDate(range.from)} to ${formatRevenueReportDate(range.to)}`, leftMargin, cursorY)

  cursorY += 16
  doc.text(`Generated: ${formatGeneratedTimestamp()}`, leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 20,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Total PT Revenue (JMD)', 'Sessions Completed']],
    body: [[formatRevenueCurrency(report.summary.totalRevenue), String(report.summary.totalSessionsCompleted)]],
    styles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = getPdfCursorY(doc as any, cursorY)

  autoTable(doc, {
    startY: cursorY,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Member Name', 'Trainer', 'PT Fee (JMD)', 'Session Date']],
    body:
      report.sessions.length > 0
        ? report.sessions.map((session) => [
            session.memberName,
            session.trainerName,
            formatRevenueCurrency(session.ptFee),
            formatRevenueReportDateTime(session.sessionDate),
          ])
        : [['No completed PT sessions found for the selected period.', '', '', '']],
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = getPdfCursorY(doc as any, cursorY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Totals by Trainer', leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 10,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Trainer', 'Revenue (JMD)', 'Sessions']],
    body:
      report.totalsByTrainer.length > 0
        ? report.totalsByTrainer.map((item) => [
            item.trainerName,
            formatRevenueCurrency(item.totalRevenue),
            String(item.sessionCount),
          ])
        : [['No trainer totals for the selected period.', '', '']],
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  addPdfFooter(doc, [
    `Generated: ${formatGeneratedTimestamp()}`,
    'Evolutionz Fitness — Confidential',
  ])

  doc.save(`revenue-pt-${range.from}-to-${range.to}.pdf`)
}

async function downloadOverallRevenuePdf(
  report: OverallRevenueReport,
  range: DateRangeValue,
) {
  if (typeof window === 'undefined') {
    return
  }

  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf/dist/jspdf.es.min.js'),
    import('jspdf-autotable/es'),
  ])
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  })
  const leftMargin = 40
  let cursorY = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text('Evolutionz Fitness — Overall Revenue Report', leftMargin, cursorY)

  cursorY += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(70, 70, 70)
  doc.text(`Period: ${formatRevenueReportDate(range.from)} to ${formatRevenueReportDate(range.to)}`, leftMargin, cursorY)

  cursorY += 16
  doc.text(`Generated: ${formatGeneratedTimestamp()}`, leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 20,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Grand Total (JMD)', 'Membership Revenue (JMD)', 'Card Fee Revenue (JMD)', 'PT Revenue (JMD)']],
    body: [[
      formatRevenueCurrency(report.summary.grandTotal),
      formatRevenueCurrency(report.summary.membershipRevenue),
      formatRevenueCurrency(report.summary.cardFeeRevenue),
      formatRevenueCurrency(report.summary.ptRevenue),
    ]],
    styles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  cursorY = getPdfCursorY(doc as any, cursorY)

  autoTable(doc, {
    startY: cursorY,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Revenue Stream', 'Amount (JMD)', '% of Total']],
    body: report.breakdown.map((item) => [
      item.revenueStream,
      formatRevenueCurrency(item.amount),
      formatRevenuePercentage(item.percentageOfTotal),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [190, 190, 190],
      lineWidth: 0.5,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
  })

  addPdfFooter(doc, [
    `Generated: ${formatGeneratedTimestamp()}`,
    'Evolutionz Fitness — Confidential',
  ])

  doc.save(`revenue-overall-${range.from}-to-${range.to}.pdf`)
}

function SummaryCard({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  )
}

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24" />
      </CardContent>
    </Card>
  )
}

function TableSkeleton({ columns, rows = 4 }: { columns: number; rows?: number }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }, (_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: columns }, (_, columnIndex) => (
                <TableCell key={columnIndex}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function InitialReportState() {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        Choose a period and click Apply to load revenue data.
      </CardContent>
    </Card>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-destructive">{message}</CardContent>
    </Card>
  )
}

function MembershipRevenueContent({
  report,
  isLoading,
  error,
  appliedRange,
  onExport,
  onMemberSelect,
}: {
  report: MembershipRevenueReport | null
  isLoading: boolean
  error: Error | null
  appliedRange: DateRangeValue | null
  onExport: () => void
  onMemberSelect: (memberId: string) => void
}) {
  if (!appliedRange) {
    return <InitialReportState />
  }

  if (error) {
    return <ErrorState message={error.message || 'Failed to load the membership revenue report.'} />
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
        </div>
        <TableSkeleton columns={6} />
      </div>
    )
  }

  if (!report) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Membership Revenue</h2>
          <p className="text-sm text-muted-foreground">
            Membership payments recorded from {formatRevenueReportDate(appliedRange.from)} to{' '}
            {formatRevenueReportDate(appliedRange.to)}.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onExport}>
          <Download className="h-4 w-4" />
          <span>Export PDF</span>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard title="Total Revenue (JMD)" value={formatRevenueCurrency(report.summary.totalRevenue)} />
        <SummaryCard title="Total Payments" value={String(report.summary.totalPayments)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member Name</TableHead>
                  <TableHead>Member Type</TableHead>
                  <TableHead className="text-right">Amount (JMD)</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.payments.length > 0 ? (
                  report.payments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      onClick={() => onMemberSelect(payment.memberId)}
                      className="cursor-pointer hover:bg-muted/20"
                    >
                      <TableCell className="font-medium">{payment.memberName}</TableCell>
                      <TableCell>{payment.memberTypeName}</TableCell>
                      <TableCell className="text-right">{formatRevenueCurrency(payment.amount)}</TableCell>
                      <TableCell>{formatPaymentMethodLabel(payment.paymentMethod)}</TableCell>
                      <TableCell>{formatRevenueReportDate(payment.paymentDate)}</TableCell>
                      <TableCell>{payment.notes ?? ''}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No membership payments found for the selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Totals by Member Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member Type</TableHead>
                    <TableHead className="text-right">Revenue (JMD)</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.totalsByMemberType.map((item) => (
                    <TableRow key={item.memberTypeName}>
                      <TableCell>{item.memberTypeName}</TableCell>
                      <TableCell className="text-right">{formatRevenueCurrency(item.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{item.paymentCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Totals by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-right">Revenue (JMD)</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.totalsByPaymentMethod.map((item) => (
                    <TableRow key={item.paymentMethod}>
                      <TableCell>{formatPaymentMethodLabel(item.paymentMethod)}</TableCell>
                      <TableCell className="text-right">{formatRevenueCurrency(item.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{item.paymentCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function CardFeeRevenueContent({
  report,
  isLoading,
  error,
  appliedRange,
  onExport,
  onMemberSelect,
}: {
  report: CardFeeRevenueReport | null
  isLoading: boolean
  error: Error | null
  appliedRange: DateRangeValue | null
  onExport: () => void
  onMemberSelect: (memberId: string) => void
}) {
  if (!appliedRange) {
    return <InitialReportState />
  }

  if (error) {
    return <ErrorState message={error.message || 'Failed to load the card fee revenue report.'} />
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
        </div>
        <TableSkeleton columns={3} />
        <TableSkeleton columns={5} />
      </div>
    )
  }

  if (!report) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Card Fees</h2>
          <p className="text-sm text-muted-foreground">
            Card fee payments recorded from {formatRevenueReportDate(appliedRange.from)} to{' '}
            {formatRevenueReportDate(appliedRange.to)}.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onExport}>
          <Download className="h-4 w-4" />
          <span>Export PDF</span>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard
          title="Total Card Fee Revenue (JMD)"
          value={formatRevenueCurrency(report.summary.totalRevenue)}
        />
        <SummaryCard title="Card Fee Payments" value={String(report.summary.totalPayments)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue (JMD)</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.monthlyBreakdown.length > 0 ? (
                  report.monthlyBreakdown.map((item) => (
                    <TableRow key={item.month}>
                      <TableCell className="font-medium">
                        {formatRevenueReportMonth(item.month)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRevenueCurrency(item.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right">{item.paymentCount}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      No card fee totals for the selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member Name</TableHead>
                  <TableHead className="text-right">Amount (JMD)</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.payments.length > 0 ? (
                  report.payments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      onClick={() => onMemberSelect(payment.memberId)}
                      className="cursor-pointer hover:bg-muted/20"
                    >
                      <TableCell className="font-medium">{payment.memberName}</TableCell>
                      <TableCell className="text-right">
                        {formatRevenueCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>{formatPaymentMethodLabel(payment.paymentMethod)}</TableCell>
                      <TableCell>{formatRevenueReportDate(payment.paymentDate)}</TableCell>
                      <TableCell>{payment.notes ?? ''}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No card fee payments found for the selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PtRevenueContent({
  report,
  isLoading,
  error,
  appliedRange,
  onExport,
  onMemberSelect,
}: {
  report: PtRevenueReport | null
  isLoading: boolean
  error: Error | null
  appliedRange: DateRangeValue | null
  onExport: () => void
  onMemberSelect: (memberId: string) => void
}) {
  if (!appliedRange) {
    return <InitialReportState />
  }

  if (error) {
    return <ErrorState message={error.message || 'Failed to load the PT revenue report.'} />
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
        </div>
        <TableSkeleton columns={4} />
      </div>
    )
  }

  if (!report) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">PT Revenue</h2>
          <p className="text-sm text-muted-foreground">
            Completed PT sessions recorded from {formatRevenueReportDate(appliedRange.from)} to{' '}
            {formatRevenueReportDate(appliedRange.to)}.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onExport}>
          <Download className="h-4 w-4" />
          <span>Export PDF</span>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard title="Total PT Revenue (JMD)" value={formatRevenueCurrency(report.summary.totalRevenue)} />
        <SummaryCard title="Total Sessions Completed" value={String(report.summary.totalSessionsCompleted)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completed Session Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member Name</TableHead>
                  <TableHead>Trainer</TableHead>
                  <TableHead className="text-right">PT Fee (JMD)</TableHead>
                  <TableHead>Session Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.sessions.length > 0 ? (
                  report.sessions.map((session) => (
                    <TableRow
                      key={session.id}
                      onClick={() => onMemberSelect(session.memberId)}
                      className="cursor-pointer hover:bg-muted/20"
                    >
                      <TableCell className="font-medium">{session.memberName}</TableCell>
                      <TableCell>{session.trainerName}</TableCell>
                      <TableCell className="text-right">{formatRevenueCurrency(session.ptFee)}</TableCell>
                      <TableCell>{formatRevenueReportDateTime(session.sessionDate)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No completed PT sessions found for the selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals by Trainer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trainer</TableHead>
                  <TableHead className="text-right">Revenue (JMD)</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.totalsByTrainer.length > 0 ? (
                  report.totalsByTrainer.map((item) => (
                    <TableRow key={item.trainerId}>
                      <TableCell>{item.trainerName}</TableCell>
                      <TableCell className="text-right">{formatRevenueCurrency(item.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{item.sessionCount}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      No trainer totals for the selected period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function OverallRevenueContent({
  report,
  isLoading,
  error,
  appliedRange,
  onExport,
}: {
  report: OverallRevenueReport | null
  isLoading: boolean
  error: Error | null
  appliedRange: DateRangeValue | null
  onExport: () => void
}) {
  if (!appliedRange) {
    return <InitialReportState />
  }

  if (error) {
    return <ErrorState message={error.message || 'Failed to load the overall revenue report.'} />
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-4">
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
        </div>
        <TableSkeleton columns={3} />
      </div>
    )
  }

  if (!report) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Overall Revenue</h2>
          <p className="text-sm text-muted-foreground">
            Combined membership, card fee, and PT revenue from{' '}
            {formatRevenueReportDate(appliedRange.from)} to {formatRevenueReportDate(appliedRange.to)}.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onExport}>
          <Download className="h-4 w-4" />
          <span>Export PDF</span>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryCard title="Grand Total Revenue (JMD)" value={formatRevenueCurrency(report.summary.grandTotal)} />
        <SummaryCard title="Membership Revenue (JMD)" value={formatRevenueCurrency(report.summary.membershipRevenue)} />
        <SummaryCard title="Card Fee Revenue (JMD)" value={formatRevenueCurrency(report.summary.cardFeeRevenue)} />
        <SummaryCard title="PT Revenue (JMD)" value={formatRevenueCurrency(report.summary.ptRevenue)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Revenue Stream</TableHead>
                  <TableHead className="text-right">Amount (JMD)</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.breakdown.map((item) => (
                  <TableRow key={item.revenueStream}>
                    <TableCell className="font-medium">{item.revenueStream}</TableCell>
                    <TableCell className="text-right">{formatRevenueCurrency(item.amount)}</TableCell>
                    <TableCell className="text-right">{formatRevenuePercentage(item.percentageOfTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function RevenueReportClient() {
  const router = useProgressRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<RevenueTab>('membership')
  const [draftPeriod, setDraftPeriod] = useState<RevenuePeriod>('this-month')
  const [draftRange, setDraftRange] = useState<DateRangeValue>(() =>
    getRevenueDateRangeForPeriod('this-month'),
  )
  const [appliedRange, setAppliedRange] = useState<DateRangeValue | null>(null)
  const membershipReportQuery = useMembershipRevenueReport(
    appliedRange?.from ?? '',
    appliedRange?.to ?? '',
    {
      enabled: isDateRangeValue(appliedRange) && activeTab === 'membership',
    },
  )
  const cardFeeReportQuery = useCardFeeRevenueReport(
    appliedRange?.from ?? '',
    appliedRange?.to ?? '',
    {
      enabled: isDateRangeValue(appliedRange) && activeTab === 'card-fees',
    },
  )
  const ptReportQuery = usePtRevenueReport(appliedRange?.from ?? '', appliedRange?.to ?? '', {
    enabled: isDateRangeValue(appliedRange) && activeTab === 'pt',
  })
  const overallReportQuery = useOverallRevenueReport(
    appliedRange?.from ?? '',
    appliedRange?.to ?? '',
    {
      enabled: isDateRangeValue(appliedRange) && activeTab === 'overall',
    },
  )

  const handlePeriodSelect = (period: RevenuePeriod) => {
    setDraftPeriod(period)

    if (period !== 'custom') {
      setDraftRange(getRevenueDateRangeForPeriod(period))
    }
  }

  const handleApply = () => {
    if (!draftRange.from || !draftRange.to) {
      toast({
        title: 'Date range required',
        description: 'Choose a start date and end date before applying the revenue filter.',
        variant: 'destructive',
      })
      return
    }

    if (!isDateValue(draftRange.from) || !isDateValue(draftRange.to)) {
      toast({
        title: 'Invalid date range',
        description: 'Start date and end date must be valid calendar dates.',
        variant: 'destructive',
      })
      return
    }

    if (draftRange.from > draftRange.to) {
      toast({
        title: 'Invalid date range',
        description: 'Start date must be on or before end date.',
        variant: 'destructive',
      })
      return
    }

    setAppliedRange({
      from: draftRange.from,
      to: draftRange.to,
    })
  }

  const handleMemberSelect = (memberId: string) => {
    const returnTo = buildReturnTo(pathname, searchParams)
    const href = returnTo
      ? `/members/${memberId}?returnTo=${encodeURIComponent(returnTo)}`
      : `/members/${memberId}`

    router.push(href)
  }

  const handleMembershipPdfDownload = async () => {
    if (!membershipReportQuery.report || !appliedRange) {
      return
    }

    try {
      await downloadMembershipRevenuePdf(membershipReportQuery.report, appliedRange)
    } catch (error) {
      toast({
        title: 'PDF export failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to download the membership revenue PDF.',
        variant: 'destructive',
      })
    }
  }

  const handlePtPdfDownload = async () => {
    if (!ptReportQuery.report || !appliedRange) {
      return
    }

    try {
      await downloadPtRevenuePdf(ptReportQuery.report, appliedRange)
    } catch (error) {
      toast({
        title: 'PDF export failed',
        description:
          error instanceof Error ? error.message : 'Failed to download the PT revenue PDF.',
        variant: 'destructive',
      })
    }
  }

  const handleCardFeePdfDownload = async () => {
    if (!cardFeeReportQuery.report || !appliedRange) {
      return
    }

    try {
      await downloadCardFeeRevenuePdf(cardFeeReportQuery.report, appliedRange)
    } catch (error) {
      toast({
        title: 'PDF export failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to download the card fee revenue PDF.',
        variant: 'destructive',
      })
    }
  }

  const handleOverallPdfDownload = async () => {
    if (!overallReportQuery.report || !appliedRange) {
      return
    }

    try {
      await downloadOverallRevenuePdf(overallReportQuery.report, appliedRange)
    } catch (error) {
      toast({
        title: 'PDF export failed',
        description:
          error instanceof Error ? error.message : 'Failed to download the overall revenue PDF.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Admin reporting for membership, card fee, and personal training revenue.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Revenue Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Period</Label>
            <div className="flex flex-wrap gap-2">
              {REVENUE_PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={draftPeriod === option.value ? 'default' : 'outline'}
                  onClick={() => handlePeriodSelect(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {draftPeriod === 'custom' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="revenue-report-from-date">Start date</Label>
                <StringDatePicker
                  id="revenue-report-from-date"
                  value={draftRange.from}
                  onChange={(value) =>
                    setDraftRange((currentRange) => ({
                      ...currentRange,
                      from: value,
                    }))
                  }
                  maxValue={draftRange.to || undefined}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="revenue-report-to-date">End date</Label>
                <StringDatePicker
                  id="revenue-report-to-date"
                  value={draftRange.to}
                  onChange={(value) =>
                    setDraftRange((currentRange) => ({
                      ...currentRange,
                      to: value,
                    }))
                  }
                  minValue={draftRange.from || undefined}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Selected period: {formatRevenueReportDate(draftRange.from)} to{' '}
              {formatRevenueReportDate(draftRange.to)}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {appliedRange
                ? `Applied period: ${formatRevenueReportDate(appliedRange.from)} to ${formatRevenueReportDate(appliedRange.to)}`
                : 'No report loaded yet.'}
            </p>
            <Button type="button" onClick={handleApply}>
              <FileText className="h-4 w-4" />
              <span>Apply</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as RevenueTab)}
        className="space-y-4"
      >
        <TabsList className="h-auto min-w-max flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="membership" className="px-3 py-1.5">
            Membership
          </TabsTrigger>
          <TabsTrigger value="card-fees" className="px-3 py-1.5">
            Card Fees
          </TabsTrigger>
          <TabsTrigger value="pt" className="px-3 py-1.5">
            PT Revenue
          </TabsTrigger>
          <TabsTrigger value="overall" className="px-3 py-1.5">
            Overall
          </TabsTrigger>
        </TabsList>

        <TabsContent value="membership" className="space-y-4">
          <MembershipRevenueContent
            report={membershipReportQuery.report}
            isLoading={membershipReportQuery.isLoading}
            error={membershipReportQuery.error as Error | null}
            appliedRange={appliedRange}
            onExport={() => void handleMembershipPdfDownload()}
            onMemberSelect={handleMemberSelect}
          />
        </TabsContent>

        <TabsContent value="card-fees" className="space-y-4">
          <CardFeeRevenueContent
            report={cardFeeReportQuery.report}
            isLoading={cardFeeReportQuery.isLoading}
            error={cardFeeReportQuery.error as Error | null}
            appliedRange={appliedRange}
            onExport={() => void handleCardFeePdfDownload()}
            onMemberSelect={handleMemberSelect}
          />
        </TabsContent>

        <TabsContent value="pt" className="space-y-4">
          <PtRevenueContent
            report={ptReportQuery.report}
            isLoading={ptReportQuery.isLoading}
            error={ptReportQuery.error as Error | null}
            appliedRange={appliedRange}
            onExport={() => void handlePtPdfDownload()}
            onMemberSelect={handleMemberSelect}
          />
        </TabsContent>

        <TabsContent value="overall" className="space-y-4">
          <OverallRevenueContent
            report={overallReportQuery.report}
            isLoading={overallReportQuery.isLoading}
            error={overallReportQuery.error as Error | null}
            appliedRange={appliedRange}
            onExport={() => void handleOverallPdfDownload()}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
