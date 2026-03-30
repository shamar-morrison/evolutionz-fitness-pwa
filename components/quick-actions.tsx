'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UserPlus, UserCheck, Receipt } from 'lucide-react'

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
        <Link href="/members?action=add">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/check-in">
          <UserCheck className="mr-2 h-4 w-4" />
          Check In
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/billing?action=new">
          <Receipt className="mr-2 h-4 w-4" />
          New Receipt
        </Link>
      </Button>
    </div>
  )
}
