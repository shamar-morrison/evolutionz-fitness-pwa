import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UserCheck } from 'lucide-react'

export default function CheckInPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Check-In</h1>
        <p className="text-muted-foreground">Scan member cards for gym access.</p>
      </div>

      <Card className="flex h-[60vh] flex-col items-center justify-center">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <UserCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Check-In Station</CardTitle>
          <CardDescription>
            This page will be built in a future update. It will include card scanning functionality
            and quick member lookup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
