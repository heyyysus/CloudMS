import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { clientDisplayName, type ClientDetail } from '@/api/clients'

interface ClientSummaryCardProps {
  client: Omit<ClientDetail, 'policies'>
}

export function ClientSummaryCard({ client }: ClientSummaryCardProps) {
  const { namedInsured, secondNamedInsured, phones, emails, mailingAddress, physicalAddress } =
    client

  return (
    <Card>
      <CardHeader>
        <CardTitle>{clientDisplayName(client)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Named Insured</p>
            <p className="text-sm">
              {namedInsured.firstName} {namedInsured.lastName}
            </p>
            <p className="text-xs text-muted-foreground">DOB {namedInsured.dateOfBirth}</p>
          </div>
          {secondNamedInsured && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Second Named Insured</p>
              <p className="text-sm">
                {secondNamedInsured.firstName} {secondNamedInsured.lastName}
              </p>
              <p className="text-xs text-muted-foreground">DOB {secondNamedInsured.dateOfBirth}</p>
            </div>
          )}
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Mailing Address</p>
            <p className="text-sm">{mailingAddress ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Physical Address</p>
            <p className="text-sm">{physicalAddress ?? '—'}</p>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Phones</p>
            {phones.length > 0 ? (
              phones.map((phone) => (
                <p key={phone.id} className="text-sm">
                  {phone.phoneNumber}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Emails</p>
            {emails.length > 0 ? (
              emails.map((email) => (
                <p key={email.id} className="text-sm">
                  {email.email}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
