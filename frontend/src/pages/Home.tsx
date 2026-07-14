import { Activity, FileText, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const sections = [
  { title: 'Clients', icon: Users, description: 'No clients yet' },
  { title: 'Policies', icon: FileText, description: 'No policies yet' },
  { title: 'Activity', icon: Activity, description: 'No recent activity' },
]

function Home() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-muted-foreground">Welcome back to CloudMS.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <section.icon className="size-4 text-muted-foreground" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{section.description} — coming soon.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default Home
