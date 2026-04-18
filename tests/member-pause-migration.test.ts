import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pausedStatusMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260425_add_paused_member_status.sql',
)

const pauseRequestsMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260425_add_member_pause_requests.sql',
)

const pausesMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260425_add_member_pauses.sql',
)

const pauseResumeRequestsMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260425_add_member_pause_resume_requests.sql',
)

const notificationTypeMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260425_add_member_pause_request_notification_type.sql',
)

const applyPauseMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260425_apply_member_pause.sql',
)

const resumePauseMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260425_resume_member_pause.sql',
)

const autoResumeMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260425_auto_resume_paused_memberships.sql',
)

const hardenPauseRpcsMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260426_harden_member_pause_rpcs.sql',
)

const approvePauseRequestMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260427_approve_member_pause_request.sql',
)

const approvePauseResumeRequestMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260428_approve_member_pause_resume_request.sql',
)

const hardenAutoResumeMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260429_harden_auto_resume_paused_memberships.sql',
)

const pendingPauseRequestIndexMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260430_add_member_pause_request_pending_unique_idx.sql',
)

function normalizeSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/gu, ' ').trim()
}

describe('member pause migrations', () => {
  it('adds paused to the member status constraint in a new migration', () => {
    const sql = normalizeSql(readFileSync(pausedStatusMigrationPath, 'utf8'))

    expect(sql).toContain('alter table public.members')
    expect(sql).toContain('drop constraint if exists members_status_check')
    expect(sql).toContain("check (status in ('active', 'expired', 'suspended', 'paused'))")
  })

  it('creates pause request and pause state tables with the expected constraints', () => {
    const requestSql = normalizeSql(readFileSync(pauseRequestsMigrationPath, 'utf8'))
    const pauseSql = normalizeSql(readFileSync(pausesMigrationPath, 'utf8'))
    const resumeRequestSql = normalizeSql(readFileSync(pauseResumeRequestsMigrationPath, 'utf8'))

    expect(requestSql).toContain('create table public.member_pause_requests')
    expect(requestSql).toContain('duration_days integer not null check (duration_days >= 7 and duration_days <= 364)')
    expect(requestSql).toContain("status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))")
    expect(requestSql).toContain('create policy "staff can insert own requests" on public.member_pause_requests')

    expect(pauseSql).toContain('create table public.member_pauses')
    expect(pauseSql).toContain("status text not null default 'active' check (status in ('active', 'resumed', 'cancelled'))")
    expect(pauseSql).toContain("create unique index member_pauses_one_active_per_member_idx on public.member_pauses (member_id) where status = 'active';")

    expect(resumeRequestSql).toContain('create table public.member_pause_resume_requests')
    expect(resumeRequestSql).toContain('pause_id uuid not null references public.member_pauses(id) on delete cascade')
    expect(resumeRequestSql).toContain("create unique index member_pause_resume_requests_pending_pause_idx on public.member_pause_resume_requests (pause_id) where status = 'pending';")
  })

  it('extends notifications and adds pause apply/resume rpc functions', () => {
    const notificationSql = normalizeSql(readFileSync(notificationTypeMigrationPath, 'utf8'))
    const applySql = readFileSync(applyPauseMigrationPath, 'utf8')
    const resumeSql = readFileSync(resumePauseMigrationPath, 'utf8')

    expect(notificationSql).toContain("'member_pause_request'")

    expect(applySql).toContain('create or replace function public.apply_member_pause(')
    expect(applySql).toContain("raise exception 'Member has no active membership.';")
    expect(applySql).toContain("raise exception 'Member already has an active pause.';")
    expect(applySql).toContain("set status = 'Paused'")
    expect(applySql).toContain('returning id into v_pause_id;')

    expect(resumeSql).toContain('create or replace function public.resume_member_pause(')
    expect(resumeSql).toContain("raise exception 'This pause is no longer active.';")
    expect(resumeSql).toContain("raise exception 'Resume date cannot be before the pause start date.';")
    expect(resumeSql).toContain("status = 'Active'")
    expect(resumeSql).toContain("status = 'resumed'")
  })

  it('adds the auto-resume function and daily pg_cron job', () => {
    const sql = normalizeSql(readFileSync(autoResumeMigrationPath, 'utf8'))

    expect(sql).toContain('create or replace function public.auto_resume_expired_pauses')
    expect(sql).toContain('public.resume_member_pause(')
    expect(sql).toContain("insert into public.access_control_jobs (type, payload) values ( 'add_card',")
    expect(sql).toContain("raise log 'auto-resumed paused membership for member %, new_end_time=%'")
    expect(sql).toContain("select cron.schedule( 'auto-resume-paused-memberships', '0 5 * * *', $$select public.auto_resume_expired_pauses(current_date);$$ );")
  })

  it('adds hardening and approval migrations in the correct order', () => {
    const orderedMigrationNames = [
      basename(hardenPauseRpcsMigrationPath),
      basename(approvePauseRequestMigrationPath),
      basename(approvePauseResumeRequestMigrationPath),
      basename(hardenAutoResumeMigrationPath),
      basename(pendingPauseRequestIndexMigrationPath),
    ]

    expect([...orderedMigrationNames].sort()).toEqual(orderedMigrationNames)
  })

  it('hardens the pause rpc functions before the approval rpcs are introduced', () => {
    const sql = readFileSync(hardenPauseRpcsMigrationPath, 'utf8')

    expect(sql).toContain('create or replace function public.apply_member_pause(')
    expect(sql).toContain("raise exception 'Pause duration is required.';")
    expect(sql).toContain("raise exception 'Current timestamp is required.';")
    expect(sql).toContain('create or replace function public.resume_member_pause(')
    expect(sql).toContain("raise exception 'Resume date is required.';")
    expect(sql).toContain("raise exception 'Resume date cannot be in the future.';")
    expect(sql).toContain('if p_actual_resume_date > p_now::date then')
  })

  it('adds atomic approval rpc functions for pause and early resume requests', () => {
    const approvePauseSql = readFileSync(approvePauseRequestMigrationPath, 'utf8')
    const approveResumeSql = readFileSync(approvePauseResumeRequestMigrationPath, 'utf8')

    expect(approvePauseSql).toContain('create or replace function public.approve_member_pause_request(')
    expect(approvePauseSql).toContain("raise exception 'Member pause request not found.';")
    expect(approvePauseSql).toContain("raise exception 'This request has already been reviewed.';")
    expect(approvePauseSql).toContain("raise exception 'Duration must match a supported membership option.';")
    expect(approvePauseSql).toContain('perform public.apply_member_pause(')
    expect(approvePauseSql).toContain('update public.member_pause_requests')
    expect(approvePauseSql).toContain("set status = 'approved',")
    expect(approvePauseSql).toContain('return v_request.id;')

    expect(approveResumeSql).toContain(
      'create or replace function public.approve_member_pause_resume_request(',
    )
    expect(approveResumeSql).toContain("raise exception 'Early resume request not found.';")
    expect(approveResumeSql).toContain("raise exception 'This request has already been reviewed.';")
    expect(approveResumeSql).toContain('perform public.resume_member_pause(')
    expect(approveResumeSql).toContain('update public.member_pause_resume_requests')
    expect(approveResumeSql).toContain("set status = 'approved',")
    expect(approveResumeSql).toContain('return v_request.id;')
  })

  it('adds per-row auto-resume exception handling and a pending pause request unique index', () => {
    const autoResumeSql = readFileSync(hardenAutoResumeMigrationPath, 'utf8')
    const pendingIndexSql = readFileSync(pendingPauseRequestIndexMigrationPath, 'utf8')

    expect(autoResumeSql).toContain('exception')
    expect(autoResumeSql).toContain('when others then')
    expect(autoResumeSql).toContain('get stacked diagnostics')
    expect(autoResumeSql).toContain(
      "raise log 'Failed to auto-resume pause %, member %: sqlstate=%, message=%, detail=%, hint=%'",
    )
    expect(autoResumeSql).toContain('continue;')

    expect(pendingIndexSql).toContain('row_number() over')
    expect(pendingIndexSql).toContain("set status = 'rejected',")
    expect(pendingIndexSql).toContain('reviewed_by = null,')
    expect(pendingIndexSql).toContain('review_timestamp = now()')
    expect(pendingIndexSql).toContain('create unique index member_pause_requests_pending_member_idx')
    expect(pendingIndexSql).toContain("where status = 'pending';")
  })
})
