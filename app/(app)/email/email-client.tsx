'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Bold, Italic, List, ListOrdered, Paperclip, UnderlineIcon, X } from 'lucide-react'
import { useMemo, useState, type ChangeEvent } from 'react'
import {
  ADMIN_EMAIL_ATTACHMENT_MAX_BYTES,
  dedupeRecipientsByEmail,
  hasMeaningfulHtmlContent,
  resolveDraftEmailRecipients,
  toEmailRecipient,
  type EmailRecipient,
  type EmailRecipientWithId,
} from '@/lib/admin-email'
import { SearchableSelect, type SearchableSelectOption } from '@/components/searchable-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Toggle } from '@/components/ui/toggle'
import { useMemberTypes } from '@/hooks/use-member-types'
import { useMembers } from '@/hooks/use-members'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type EmailClientProps = {
  resendDailyLimit: number
}

type ErrorResponse = {
  ok?: false
  error: string
}

type RecipientsSuccessResponse = {
  ok: true
  recipients: EmailRecipientWithId[]
}

type SendSuccessResponse = {
  ok: true
  sentCount: number
}

function formatAttachmentSize(size: number) {
  const sizeInMegabytes = size / (1024 * 1024)
  return `${sizeInMegabytes.toFixed(sizeInMegabytes >= 10 ? 0 : 1)} MB`
}

function getResponseErrorMessage(responseBody: unknown, fallback: string) {
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
  ) {
    return responseBody.error
  }

  return fallback
}

function buildRecipientsLookupUrl(input: {
  activeMembers: boolean
  expiringMembers: boolean
  memberTypeIds: string[]
  individualIds: string[]
}) {
  const searchParams = new URLSearchParams()

  if (input.activeMembers) {
    searchParams.set('activeMembers', 'true')
  }

  if (input.expiringMembers) {
    searchParams.set('expiringMembers', 'true')
  }

  if (input.memberTypeIds.length > 0) {
    searchParams.set('memberTypeIds', input.memberTypeIds.join(','))
  }

  if (input.individualIds.length > 0) {
    searchParams.set('individualIds', input.individualIds.join(','))
  }

  const queryString = searchParams.toString()
  return queryString ? `/api/email/recipients?${queryString}` : '/api/email/recipients'
}

export function EmailClient({ resendDailyLimit }: EmailClientProps) {
  const [includeActiveMembers, setIncludeActiveMembers] = useState(false)
  const [includeExpiringMembers, setIncludeExpiringMembers] = useState(false)
  const [includeMemberTypes, setIncludeMemberTypes] = useState(false)
  const [selectedMemberTypeIds, setSelectedMemberTypeIds] = useState<string[]>([])
  const [selectedIndividuals, setSelectedIndividuals] = useState<EmailRecipientWithId[]>([])
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const { members, isLoading: isMembersLoading, error: membersError } = useMembers()
  const { memberTypes, isLoading: isMemberTypesLoading, error: memberTypesError } = useMemberTypes()
  const activeMemberTypes = useMemo(
    () => memberTypes.filter((memberType) => memberType.is_active),
    [memberTypes],
  )
  const selectedIndividualIds = useMemo(
    () => selectedIndividuals.map((recipient) => recipient.id),
    [selectedIndividuals],
  )
  const liveRecipients = useMemo(
    () =>
      resolveDraftEmailRecipients(members, {
        activeMembers: includeActiveMembers,
        expiringMembers: includeExpiringMembers,
        includeMemberTypes,
        memberTypeIds: selectedMemberTypeIds,
        individualIds: selectedIndividualIds,
      }),
    [
      includeActiveMembers,
      includeExpiringMembers,
      includeMemberTypes,
      members,
      selectedIndividualIds,
      selectedMemberTypeIds,
    ],
  )
  const dedupedLiveRecipients = useMemo(
    () => dedupeRecipientsByEmail(liveRecipients),
    [liveRecipients],
  )
  const individualPickerOptions = useMemo<SearchableSelectOption[]>(
    () =>
      members
        .flatMap((member) => {
          const recipient = toEmailRecipient(member)

          if (!recipient || selectedIndividualIds.includes(recipient.id)) {
            return []
          }

          return [
            {
              value: recipient.id,
              label: recipient.name,
              description: recipient.email,
              keywords: [recipient.email, member.employeeNo, member.status],
            } satisfies SearchableSelectOption,
          ]
        })
        .sort((left, right) => left.label.localeCompare(right.label)),
    [members, selectedIndividualIds],
  )
  const isBodyEmpty = !hasMeaningfulHtmlContent(bodyHtml)
  const recipientCount = dedupedLiveRecipients.length
  const shouldShowLimitWarning = recipientCount > resendDailyLimit
  const isSendDisabled =
    isSending || recipientCount === 0 || !subject.trim() || isBodyEmpty || isMembersLoading

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
    ],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'min-h-[240px] px-4 py-3 text-sm focus:outline-none [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1',
      },
    },
    onUpdate({ editor: nextEditor }) {
      setBodyHtml(nextEditor.getHTML())
    },
  })

  const handleSelectIndividual = (memberId: string) => {
    const recipientToAdd = resolveDraftEmailRecipients(members, {
      activeMembers: false,
      expiringMembers: false,
      includeMemberTypes: false,
      memberTypeIds: [],
      individualIds: [memberId],
    })[0]

    if (!recipientToAdd) {
      return
    }

    setSelectedIndividuals((currentRecipients) => {
      if (currentRecipients.some((recipient) => recipient.id === recipientToAdd.id)) {
        return currentRecipients
      }

      return [...currentRecipients, recipientToAdd]
    })
  }

  const handleRemoveIndividual = (memberId: string) => {
    setSelectedIndividuals((currentRecipients) =>
      currentRecipients.filter((recipient) => recipient.id !== memberId),
    )
  }

  const handleToggleMemberType = (memberTypeId: string, checked: boolean) => {
    setSelectedMemberTypeIds((currentIds) => {
      if (checked) {
        return currentIds.includes(memberTypeId) ? currentIds : [...currentIds, memberTypeId]
      }

      return currentIds.filter((currentId) => currentId !== memberTypeId)
    })
  }

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null

    if (!file) {
      setAttachment(null)
      setAttachmentError(null)
      return
    }

    if (file.size > ADMIN_EMAIL_ATTACHMENT_MAX_BYTES) {
      setAttachment(null)
      setAttachmentError('Attachment must be 15MB or under.')
      event.target.value = ''
      return
    }

    setAttachment(file)
    setAttachmentError(null)
  }

  const resetForm = () => {
    setIncludeActiveMembers(false)
    setIncludeExpiringMembers(false)
    setIncludeMemberTypes(false)
    setSelectedMemberTypeIds([])
    setSelectedIndividuals([])
    setSubject('')
    setAttachment(null)
    setAttachmentError(null)
    setBodyHtml('')
    editor?.commands.clearContent()
  }

  const handleSend = async () => {
    if (isSendDisabled) {
      return
    }

    setIsSending(true)

    try {
      const recipientsResponse = await fetch(
        buildRecipientsLookupUrl({
          activeMembers: includeActiveMembers,
          expiringMembers: includeExpiringMembers,
          memberTypeIds: includeMemberTypes ? selectedMemberTypeIds : [],
          individualIds: selectedIndividualIds,
        }),
        {
          method: 'GET',
          cache: 'no-store',
        },
      )

      let recipientsResponseBody: RecipientsSuccessResponse | ErrorResponse | null = null

      try {
        recipientsResponseBody = (await recipientsResponse.json()) as
          | RecipientsSuccessResponse
          | ErrorResponse
      } catch {
        recipientsResponseBody = null
      }

      if (
        !recipientsResponse.ok ||
        !recipientsResponseBody ||
        !('recipients' in recipientsResponseBody)
      ) {
        throw new Error(
          getResponseErrorMessage(
            recipientsResponseBody,
            'Failed to resolve email recipients.',
          ),
        )
      }

      const resolvedRecipients = recipientsResponseBody.recipients.map(({ name, email }) => ({
        name,
        email,
      }))
      const recipientsToSend: EmailRecipient[] = dedupeRecipientsByEmail(resolvedRecipients).slice(
        0,
        resendDailyLimit,
      )

      if (recipientsToSend.length === 0) {
        throw new Error('Select at least one recipient before sending.')
      }

      const formData = new FormData()
      formData.set('subject', subject.trim())
      formData.set('body', bodyHtml)
      formData.set('recipients', JSON.stringify(recipientsToSend))

      if (attachment) {
        formData.set('attachment', attachment)
      }

      const sendResponse = await fetch('/api/email/send', {
        method: 'POST',
        body: formData,
      })

      let sendResponseBody: SendSuccessResponse | ErrorResponse | null = null

      try {
        sendResponseBody = (await sendResponse.json()) as SendSuccessResponse | ErrorResponse
      } catch {
        sendResponseBody = null
      }

      if (!sendResponse.ok || !sendResponseBody || !('sentCount' in sendResponseBody)) {
        throw new Error(
          getResponseErrorMessage(sendResponseBody, 'Failed to send the email.'),
        )
      }

      toast({
        title: 'Email sent',
        description: `Email sent to ${sendResponseBody.sentCount} recipients.`,
      })
      resetForm()
    } catch (error) {
      toast({
        title: 'Send failed',
        description:
          error instanceof Error ? error.message : 'Failed to send the email.',
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Send Email</h1>
        <p className="text-muted-foreground">
          Compose and send an email to selected Evolutionz Fitness members.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSend()
        }}
      >
        <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Recipients</h2>
            <p className="text-sm text-muted-foreground">
              Combine group filters and specific members. Duplicate email addresses are removed
              automatically before send.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="email-active-members"
                  checked={includeActiveMembers}
                  onCheckedChange={(checked) => setIncludeActiveMembers(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="email-active-members">All active members</Label>
                  <p className="text-sm text-muted-foreground">
                    Members whose status is currently Active.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="email-expiring-members"
                  checked={includeExpiringMembers}
                  onCheckedChange={(checked) => setIncludeExpiringMembers(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="email-expiring-members">All expiring members</Label>
                  <p className="text-sm text-muted-foreground">
                    Active members whose membership ends within the next 7 days.
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="email-member-types"
                    checked={includeMemberTypes}
                    onCheckedChange={(checked) => setIncludeMemberTypes(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="email-member-types">By membership type</Label>
                    <p className="text-sm text-muted-foreground">
                      Choose one or more active membership types to include.
                    </p>
                  </div>
                </div>

                {includeMemberTypes ? (
                  <div className="rounded-xl border border-dashed border-border bg-background/80 p-4">
                    {isMemberTypesLoading ? (
                      <p className="text-sm text-muted-foreground">Loading membership types...</p>
                    ) : activeMemberTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No active membership types are available.
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {activeMemberTypes.map((memberType) => {
                          const checkboxId = `email-member-type-${memberType.id}`
                          const isChecked = selectedMemberTypeIds.includes(memberType.id)

                          return (
                            <label
                              key={memberType.id}
                              htmlFor={checkboxId}
                              className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2"
                            >
                              <Checkbox
                                id={checkboxId}
                                checked={isChecked}
                                onCheckedChange={(checked) =>
                                  handleToggleMemberType(memberType.id, checked === true)
                                }
                              />
                              <span className="space-y-1">
                                <span className="block text-sm font-medium text-foreground">
                                  {memberType.name}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email-member-picker">Add individual members</Label>
                <p className="text-sm text-muted-foreground">
                  Search members by name and add them one at a time.
                </p>
              </div>

              <div id="email-member-picker">
                <SearchableSelect
                  value={null}
                  onValueChange={handleSelectIndividual}
                  options={individualPickerOptions}
                  placeholder={isMembersLoading ? 'Loading members...' : 'Search members by name'}
                  searchPlaceholder="Search members..."
                  emptyMessage="No members with email addresses found."
                  disabled={isMembersLoading || individualPickerOptions.length === 0}
                />
              </div>

              {selectedIndividuals.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedIndividuals.map((recipient) => (
                    <Badge
                      key={recipient.id}
                      variant="secondary"
                      className="gap-2 rounded-full px-3 py-1"
                    >
                      <span className="max-w-[220px] truncate">
                        {recipient.name} ({recipient.email})
                      </span>
                      <button
                        type="button"
                        className="rounded-full text-muted-foreground transition hover:text-foreground"
                        onClick={() => handleRemoveIndividual(recipient.id)}
                        aria-label={`Remove ${recipient.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              {recipientCount} recipient{recipientCount === 1 ? '' : 's'} selected
            </p>
            {shouldShowLimitWarning ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                Resend&apos;s free plan supports 100 emails per day. Only the first{' '}
                {resendDailyLimit} recipients will receive this email.
              </div>
            ) : null}
            {membersError ? (
              <p className="text-sm text-destructive">{membersError.message}</p>
            ) : null}
            {memberTypesError ? (
              <p className="text-sm text-destructive">{memberTypesError.message}</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Compose</h2>
            <p className="text-sm text-muted-foreground">
              Write the subject, rich-text body, and optional attachment.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Enter an email subject"
              disabled={isSending}
              required
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Email body</Label>
              <div className="flex flex-wrap gap-2 rounded-t-xl border border-border border-b-0 bg-muted/20 px-3 py-2">
                <Toggle
                  type="button"
                  variant="outline"
                  size="sm"
                  pressed={editor?.isActive('bold') ?? false}
                  onPressedChange={() => editor?.chain().focus().toggleBold().run()}
                  disabled={!editor || isSending}
                  aria-label="Bold"
                >
                  <Bold className="h-4 w-4" />
                </Toggle>
                <Toggle
                  type="button"
                  variant="outline"
                  size="sm"
                  pressed={editor?.isActive('italic') ?? false}
                  onPressedChange={() => editor?.chain().focus().toggleItalic().run()}
                  disabled={!editor || isSending}
                  aria-label="Italic"
                >
                  <Italic className="h-4 w-4" />
                </Toggle>
                <Toggle
                  type="button"
                  variant="outline"
                  size="sm"
                  pressed={editor?.isActive('underline') ?? false}
                  onPressedChange={() => editor?.chain().focus().toggleUnderline().run()}
                  disabled={!editor || isSending}
                  aria-label="Underline"
                >
                  <UnderlineIcon className="h-4 w-4" />
                </Toggle>
                <Toggle
                  type="button"
                  variant="outline"
                  size="sm"
                  pressed={editor?.isActive('bulletList') ?? false}
                  onPressedChange={() => editor?.chain().focus().toggleBulletList().run()}
                  disabled={!editor || isSending}
                  aria-label="Bullet list"
                >
                  <List className="h-4 w-4" />
                </Toggle>
                <Toggle
                  type="button"
                  variant="outline"
                  size="sm"
                  pressed={editor?.isActive('orderedList') ?? false}
                  onPressedChange={() => editor?.chain().focus().toggleOrderedList().run()}
                  disabled={!editor || isSending}
                  aria-label="Ordered list"
                >
                  <ListOrdered className="h-4 w-4" />
                </Toggle>
              </div>
              <div
                className={cn(
                  'overflow-hidden rounded-b-xl border border-border bg-background',
                  isBodyEmpty ? 'border-border' : '',
                )}
              >
                <EditorContent editor={editor} />
              </div>
              <p className="text-sm text-muted-foreground">
                The email body is sent as rich HTML.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-attachment">Attachment</Label>
              <Input
                id="email-attachment"
                type="file"
                onChange={handleAttachmentChange}
                disabled={isSending}
              />
              {attachment ? (
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">
                      {attachment.name} ({formatAttachmentSize(attachment.size)})
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttachment(null)}
                    disabled={isSending}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
              {attachmentError ? (
                <p className="text-sm text-destructive">{attachmentError}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Attach any file up to 15MB.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Send</h2>
              <p className="text-sm text-muted-foreground">
                The message is sent immediately and is not stored in the app.
              </p>
            </div>
            <Button type="submit" disabled={isSendDisabled} className="sm:min-w-[160px]">
              {isSending ? <Spinner className="mr-2" /> : null}
              {isSending ? 'Sending...' : 'Send Email'}
            </Button>
          </div>
        </section>
      </form>
    </div>
  )
}
