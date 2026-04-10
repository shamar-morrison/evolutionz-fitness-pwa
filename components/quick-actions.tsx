'use client'

import Link from 'next/link'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { UserPlus } from 'lucide-react'

export function QuickActions() {
  const { can } = usePermissions()

  return (
    <div className="flex flex-wrap gap-3">
      {can('members.create') ? (
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link data-progress href="/members?action=add">
            <UserPlus className="h-4 w-4" />
            Add Member
          </Link>
        </Button>
      ) : null}
    </div>
  )
}
