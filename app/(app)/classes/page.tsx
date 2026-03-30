import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from 'lucide-react'

export default function ClassesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Classes</h1>
        <p className="text-muted-foreground">Manage gym classes and schedules.</p>
      </div>

      <Card className="flex h-[60vh] flex-col items-center justify-center">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Calendar className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Class Schedule</CardTitle>
          <CardDescription>
            This page will be built in a future update. It will include class scheduling,
            instructor assignment, and member sign-ups.
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
