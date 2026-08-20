import { ManageReminderRulesCard } from '@/components/admin/reminder-rule-list'
import { UpcomingReminders } from '@/components/admin/upcoming-reminders'

function ReminderRules() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reminders</h1>
        <p className="text-muted-foreground">
          Send a correspondence template automatically, a set number of days from a policy's
          expiration date. A rule only sends once it is turned on.
        </p>
      </div>
      <ManageReminderRulesCard />
      <UpcomingReminders />
    </div>
  )
}

export default ReminderRules
