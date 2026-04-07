'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RoleGuard } from '@/components/role-guard'
import { UserPlus, UserCheck, Receipt } from 'lucide-react'

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <RoleGuard role="admin">
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href="/members?action=add">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Member
          </Link>
        </Button>
      </RoleGuard>
    </div>
  )
}
