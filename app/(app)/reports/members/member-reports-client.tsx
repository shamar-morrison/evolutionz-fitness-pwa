'use client'

import { useState } from 'react'
import { BarChart3, Download, FileText } from 'lucide-react'
import { useMemberExpiredReport, useMemberSignupsReport } from '@/hooks/use-member-reports'
import { toast } from '@/hooks/use-toast'
import {
  createEmptyMemberReportRevenueBreakdown,
  formatMemberReportRevenue,
  formatMemberReportDate,
  formatMemberReportGeneratedTimestamp,
  getMemberReportAppliedPeriodLabel,
  getMemberReportDateRangeForPeriod,
  isMemberReportPeriod,
  isValidMemberReportDateRange,
  MEMBER_REPORT_PERIOD_OPTIONS,
  type MemberExpiredReport,
  type MemberReportDateRange,
  type MemberReportPeriod,
  type MemberReportRevenueBreakdown,
  type MemberSignupsReport,
} from '@/lib/member-reports'
import { replaceCurrentUrl } from '@/lib/client-history'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PaginationControls } from '@/components/pagination-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type MemberReportTab = 'signups' | 'expired'

type MemberSignupReportItem = MemberSignupsReport['members'][number]
type MemberExpiredReportItem = MemberExpiredReport['members'][number]

const PAGE_SIZE = 50

function getPdfCursorY(doc: { lastAutoTable?: { finalY: number } }, fallback: number) {
  return (doc.lastAutoTable?.finalY ?? fallback) + 20
}

function getMemberReportPageDetails<T>(rows: T[], currentPage: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const normalizedCurrentPage = Math.max(0, Math.min(currentPage, totalPages - 1))
  const paginatedRows = rows.slice(
    normalizedCurrentPage * PAGE_SIZE,
    (normalizedCurrentPage + 1) * PAGE_SIZE,
  )
  const rangeStart = rows.length === 0 ? 0 : normalizedCurrentPage * PAGE_SIZE + 1
  const rangeEnd = rows.length === 0 ? 0 : rangeStart + paginatedRows.length - 1

  return {
    totalPages,
    normalizedCurrentPage,
    paginatedRows,
    rangeStart,
    rangeEnd,
  }
}

function buildRevenueBreakdownPdfRows(revenueBreakdown: MemberReportRevenueBreakdown) {
  return revenueBreakdown.byType.map((item) => [
    item.isEstimate ? `${item.label} *` : item.label,
    formatMemberReportRevenue(item.total),
  ])
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

function isMemberReportTab(value: string | null): value is MemberReportTab {
  return value === 'signups' || value === 'expired'
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value || !/^\d+$/u.test(value)) {
    return fallback
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return fallback
  }

  return parsedValue
}

function getLocationSearchParams() {
  if (typeof window === 'undefined') {
    return new URLSearchParams()
  }

  return new URLSearchParams(window.location.search)
}

function getNormalizedInitialState() {
  const searchParams = getLocationSearchParams()
  const requestedTab = searchParams.get('tab')
  const requestedPeriod = searchParams.get('period')
  const startDate = searchParams.get('startDate') ?? ''
  const endDate = searchParams.get('endDate') ?? ''
  const activeTab = isMemberReportTab(requestedTab) ? requestedTab : 'signups'
  const requestedPage = parsePositiveInteger(searchParams.get('page'), 1) - 1

  if (
    requestedPeriod === 'custom' &&
    isValidMemberReportDateRange({
      startDate,
      endDate,
    })
  ) {
    return {
      activeTab,
      appliedPeriod: 'custom' as const,
      appliedRange: {
        startDate,
        endDate,
      },
      currentPage: requestedPage,
    }
  }

  const appliedPeriod = isMemberReportPeriod(requestedPeriod ?? '')
    ? (requestedPeriod as MemberReportPeriod)
    : 'this-month'

  return {
    activeTab,
    appliedPeriod,
    appliedRange: getMemberReportDateRangeForPeriod(appliedPeriod),
    currentPage: requestedPage,
  }
}

function buildMemberReportsUrl(state: {
  activeTab: MemberReportTab
  appliedPeriod: MemberReportPeriod
  appliedRange: MemberReportDateRange
  currentPage: number
}) {
  const pathname = typeof window === 'undefined' ? '/reports/members' : window.location.pathname
  const searchParams = new URLSearchParams()

  searchParams.set('tab', state.activeTab)
  searchParams.set('period', state.appliedPeriod)

  if (state.appliedPeriod === 'custom') {
    searchParams.set('startDate', state.appliedRange.startDate)
    searchParams.set('endDate', state.appliedRange.endDate)
  }

  if (state.currentPage > 0) {
    searchParams.set('page', String(state.currentPage + 1))
  }

  return `${pathname}?${searchParams.toString()}`
}

async function downloadMemberReportPdf(options: {
  title: string
  filePrefix: string
  period: MemberReportDateRange
  summaryLabel: string
  revenueBreakdown: MemberReportRevenueBreakdown
  columns: string[]
  rows: string[][]
}) {
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
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const leftMargin = 40
  let cursorY = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text(options.title, leftMargin, cursorY)

  cursorY += 24
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(70, 70, 70)
  doc.text(
    `Period: ${formatMemberReportDate(options.period.startDate)} to ${formatMemberReportDate(options.period.endDate)}`,
    leftMargin,
    cursorY,
  )

  cursorY += 16
  doc.text(`Generated: ${formatMemberReportGeneratedTimestamp()}`, leftMargin, cursorY)

  autoTable(doc, {
    startY: cursorY + 20,
    margin: { left: leftMargin, right: leftMargin },
    theme: 'grid',
    head: [['Total Results', 'Summary']],
    body: [[String(options.rows.length), options.summaryLabel]],
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
    head: [options.columns],
    body:
      options.rows.length > 0
        ? options.rows
        : [['No members found for the selected period.', '', '', '']],
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

  if (options.rows.length > 0) {
    cursorY = getPdfCursorY(doc as any, cursorY)

    autoTable(doc, {
      startY: cursorY,
      margin: { left: leftMargin, right: leftMargin },
      theme: 'grid',
      head: [['Revenue Breakdown', 'Amount (JMD)']],
      body: buildRevenueBreakdownPdfRows(options.revenueBreakdown),
      foot: [['Total Revenue', formatMemberReportRevenue(options.revenueBreakdown.total)]],
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
      footStyles: {
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: {
        1: { halign: 'right' },
      },
    })

    if (options.revenueBreakdown.hasEstimates) {
      cursorY = getPdfCursorY(doc as any, cursorY)

      if (cursorY > pageHeight - 60) {
        doc.addPage()
        cursorY = 48
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(90, 90, 90)
      doc.text(
        "* Estimated figures are based on the member's current membership rate where no payment was recorded in this period.",
        leftMargin,
        cursorY,
        {
          maxWidth: pageWidth - leftMargin * 2,
        },
      )
    }
  }

  addPdfFooter(doc, [
    `Generated: ${formatMemberReportGeneratedTimestamp()}`,
    'Evolutionz Fitness — Confidential',
  ])

  doc.save(
    `${options.filePrefix}-${options.period.startDate}-to-${options.period.endDate}.pdf`,
  )
}

function MemberReportRevenueBreakdownSection({
  revenueBreakdown,
}: {
  revenueBreakdown: MemberReportRevenueBreakdown
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Revenue Breakdown</h3>
        <p className="text-sm text-muted-foreground">
          Revenue generated within the selected period for the members in this filtered list.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-muted/40">
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {revenueBreakdown.byType.map((item) => (
              <TableRow key={item.label}>
                <TableCell className="font-medium">
                  <span>{item.label}</span>
                  {item.isEstimate ? (
                    <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Est.
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatMemberReportRevenue(item.total)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/20 font-semibold hover:bg-muted/20">
              <TableCell>Total Revenue</TableCell>
              <TableCell className="text-right">
                {formatMemberReportRevenue(revenueBreakdown.total)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {revenueBreakdown.hasEstimates ? (
        <p className="text-xs text-muted-foreground">
          * Estimated figures are based on the member&apos;s current membership rate where no
          payment was recorded in this period.
        </p>
      ) : null}
    </div>
  )
}

function MemberReportTable({
  emptyLabel,
  rows,
  dateColumnLabel,
  getDateValue,
}: {
  emptyLabel: string
  rows: Array<MemberSignupReportItem | MemberExpiredReportItem>
  dateColumnLabel: string
  getDateValue: (row: MemberSignupReportItem | MemberExpiredReportItem) => string
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-muted/40">
            <TableHead>Member name</TableHead>
            <TableHead>Membership type</TableHead>
            <TableHead>{dateColumnLabel}</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>{formatMemberReportDate(getDateValue(row))}</TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function MemberReportResults({
  summaryLabel,
  emptyLabel,
  rows,
  dateColumnLabel,
  getDateValue,
  currentPage,
  onPageChange,
  revenueBreakdown,
}: {
  summaryLabel: string
  emptyLabel: string
  rows: Array<MemberSignupReportItem | MemberExpiredReportItem>
  dateColumnLabel: string
  getDateValue: (row: MemberSignupReportItem | MemberExpiredReportItem) => string
  currentPage: number
  onPageChange: (page: number) => void
  revenueBreakdown: MemberReportRevenueBreakdown
}) {
  const { totalPages, normalizedCurrentPage, paginatedRows, rangeStart, rangeEnd } =
    getMemberReportPageDetails(rows, currentPage)

  return (
    <>
      <div className="rounded-lg border bg-muted/20 px-4 py-4">
        <p className="text-sm text-muted-foreground">{summaryLabel}</p>
      </div>

      <MemberReportTable
        emptyLabel={emptyLabel}
        rows={paginatedRows}
        dateColumnLabel={dateColumnLabel}
        getDateValue={getDateValue}
      />

      {rows.length > 0 ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {rangeStart}-{rangeEnd} of {rows.length}
            </p>
            <PaginationControls
              currentPage={normalizedCurrentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </div>

          <MemberReportRevenueBreakdownSection revenueBreakdown={revenueBreakdown} />
        </>
      ) : null}
    </>
  )
}

export function MemberReportsClient() {
  const initialState = getNormalizedInitialState()
  const [activeTab, setActiveTab] = useState<MemberReportTab>(initialState.activeTab)
  const [draftPeriod, setDraftPeriod] = useState<MemberReportPeriod>(initialState.appliedPeriod)
  const [draftRange, setDraftRange] = useState<MemberReportDateRange>(initialState.appliedRange)
  const [appliedPeriod, setAppliedPeriod] = useState<MemberReportPeriod>(initialState.appliedPeriod)
  const [appliedRange, setAppliedRange] = useState<MemberReportDateRange>(initialState.appliedRange)
  const [currentPage, setCurrentPage] = useState(initialState.currentPage)

  const signupsQuery = useMemberSignupsReport(appliedRange.startDate, appliedRange.endDate, {
    enabled: activeTab === 'signups',
  })
  const expiredQuery = useMemberExpiredReport(appliedRange.startDate, appliedRange.endDate, {
    enabled: activeTab === 'expired',
  })
  const signupsRows = signupsQuery.report?.members ?? []
  const expiredRows = expiredQuery.report?.members ?? []
  const activeRows: Array<MemberSignupReportItem | MemberExpiredReportItem> =
    activeTab === 'signups' ? signupsRows : expiredRows

  const activeReport = activeTab === 'signups' ? signupsQuery.report : expiredQuery.report
  const isLoading = activeTab === 'signups' ? signupsQuery.isLoading : expiredQuery.isLoading
  const isFetching = activeTab === 'signups' ? signupsQuery.isFetching : expiredQuery.isFetching
  const error = activeTab === 'signups' ? signupsQuery.error : expiredQuery.error
  const appliedPeriodLabel = getMemberReportAppliedPeriodLabel(appliedPeriod, appliedRange)
  const hasLoadedReport = activeReport !== null
  const { normalizedCurrentPage } = getMemberReportPageDetails(activeRows, currentPage)

  const setUrlState = (nextState: {
    activeTab?: MemberReportTab
    appliedPeriod?: MemberReportPeriod
    appliedRange?: MemberReportDateRange
    currentPage?: number
  }) => {
    replaceCurrentUrl(
      buildMemberReportsUrl({
        activeTab: nextState.activeTab ?? activeTab,
        appliedPeriod: nextState.appliedPeriod ?? appliedPeriod,
        appliedRange: nextState.appliedRange ?? appliedRange,
        currentPage: nextState.currentPage ?? normalizedCurrentPage,
      }),
    )
  }

  const handleApply = () => {
    const nextAppliedRange =
      draftPeriod === 'custom' ? draftRange : getMemberReportDateRangeForPeriod(draftPeriod)

    if (!isValidMemberReportDateRange(nextAppliedRange)) {
      toast({
        title: 'Invalid date range',
        description: 'Start date must be on or before end date.',
        variant: 'destructive',
      })
      return
    }

    setAppliedPeriod(draftPeriod)
    setAppliedRange(nextAppliedRange)
    setCurrentPage(0)
    setUrlState({
      appliedPeriod: draftPeriod,
      appliedRange: nextAppliedRange,
      currentPage: 0,
    })
  }

  const handleTabChange = (value: string) => {
    if (!isMemberReportTab(value)) {
      return
    }

    setActiveTab(value)
    setCurrentPage(0)
    setUrlState({
      activeTab: value,
      currentPage: 0,
    })
  }

  const handlePeriodSelect = (period: MemberReportPeriod) => {
    setDraftPeriod(period)

    if (period !== 'custom') {
      setDraftRange(getMemberReportDateRangeForPeriod(period))
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    setUrlState({ currentPage: page })
  }

  const handleDownloadPdf = async () => {
    const report = activeReport

    if (!report) {
      return
    }

    try {
      if (activeTab === 'signups') {
        await downloadMemberReportPdf({
          title: 'Evolutionz Fitness — Member Signup Report',
          filePrefix: 'member-signups',
          period: appliedRange,
          summaryLabel: `${activeRows.length} members signed up in ${appliedPeriodLabel}`,
          revenueBreakdown: report.revenueBreakdown,
          columns: ['Member Name', 'Membership Type', 'Join Date', 'Status'],
          rows: (activeRows as MemberSignupReportItem[]).map((member) => [
            member.name,
            member.type,
            formatMemberReportDate(member.joinedAt),
            member.status,
          ]),
        })
        return
      }

      await downloadMemberReportPdf({
        title: 'Evolutionz Fitness — Member Expiry Report',
        filePrefix: 'member-expired',
        period: appliedRange,
        summaryLabel: `${activeRows.length} memberships expired in ${appliedPeriodLabel}`,
        revenueBreakdown: report.revenueBreakdown,
        columns: ['Member Name', 'Membership Type', 'Expiry Date', 'Status'],
        rows: (activeRows as MemberExpiredReportItem[]).map((member) => [
          member.name,
          member.type,
          formatMemberReportDate(member.expiryDate),
          member.status,
        ]),
      })
    } catch (downloadError) {
      toast({
        title: 'PDF export failed',
        description:
          downloadError instanceof Error
            ? downloadError.message
            : 'Failed to download the member report PDF.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Member Reports</h1>
        <p className="text-sm text-muted-foreground">
          Admin reporting for member signup and membership expiry trends.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {MEMBER_REPORT_PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={draftPeriod === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePeriodSelect(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {draftPeriod === 'custom' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="member-reports-start-date">Start date</Label>
                <Input
                  id="member-reports-start-date"
                  type="date"
                  value={draftRange.startDate}
                  onChange={(event) =>
                    setDraftRange((currentRange) => ({
                      ...currentRange,
                      startDate: event.target.value,
                    }))
                  }
                  max={draftRange.endDate || undefined}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-reports-end-date">End date</Label>
                <Input
                  id="member-reports-end-date"
                  type="date"
                  value={draftRange.endDate}
                  onChange={(event) =>
                    setDraftRange((currentRange) => ({
                      ...currentRange,
                      endDate: event.target.value,
                    }))
                  }
                  min={draftRange.startDate || undefined}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Selected period: {formatMemberReportDate(draftRange.startDate)} to{' '}
              {formatMemberReportDate(draftRange.endDate)}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Applied period: {formatMemberReportDate(appliedRange.startDate)} to{' '}
              {formatMemberReportDate(appliedRange.endDate)}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" onClick={handleApply} disabled={isFetching}>
                <FileText className="h-4 w-4" />
                <span>{isFetching ? 'Applying...' : 'Apply'}</span>
              </Button>
              {hasLoadedReport ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDownloadPdf()}
                  disabled={isLoading}
                >
                  <Download className="h-4 w-4" />
                  <span>Download PDF</span>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-auto min-w-max flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="signups" className="px-3 py-1.5">
            Signed Up
          </TabsTrigger>
          <TabsTrigger value="expired" className="px-3 py-1.5">
            Expired
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signups" className="space-y-4">
          <Card>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-72 w-full" />
                </div>
              ) : error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm text-destructive">
                    {error instanceof Error
                      ? error.message
                      : 'Failed to load the member signup report.'}
                  </p>
                </div>
              ) : (
                <>
                  <MemberReportResults
                    summaryLabel={`${signupsRows.length} members signed up in ${appliedPeriodLabel}`}
                    emptyLabel="No members signed up in the selected period."
                    rows={signupsRows as MemberSignupReportItem[]}
                    dateColumnLabel="Join Date"
                    getDateValue={(row) => (row as MemberSignupReportItem).joinedAt}
                    currentPage={currentPage}
                    onPageChange={handlePageChange}
                    revenueBreakdown={
                      signupsQuery.report?.revenueBreakdown ??
                      createEmptyMemberReportRevenueBreakdown()
                    }
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expired" className="space-y-4">
          <Card>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-72 w-full" />
                </div>
              ) : error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm text-destructive">
                    {error instanceof Error
                      ? error.message
                      : 'Failed to load the member expiry report.'}
                  </p>
                </div>
              ) : (
                <>
                  <MemberReportResults
                    summaryLabel={`${expiredRows.length} memberships expired in ${appliedPeriodLabel}`}
                    emptyLabel="No memberships expired in the selected period."
                    rows={expiredRows as MemberExpiredReportItem[]}
                    dateColumnLabel="Expiry Date"
                    getDateValue={(row) => (row as MemberExpiredReportItem).expiryDate}
                    currentPage={currentPage}
                    onPageChange={handlePageChange}
                    revenueBreakdown={
                      expiredQuery.report?.revenueBreakdown ??
                      createEmptyMemberReportRevenueBreakdown()
                    }
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
