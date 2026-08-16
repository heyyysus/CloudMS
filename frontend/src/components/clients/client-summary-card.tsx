import type { ReactNode } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CopyText, useCopyToClipboard } from '@/components/ui/copy-text'
import { clientDisplayName, formatClientId, type ClientDetail } from '@/api/clients'
import { formatAddress, formatAddressLines, pickAddress } from '@/lib/address'
import { formatNameLastFirst } from '@/lib/person-name'
import { formatPhone } from '@/lib/phone'

interface ClientSummaryCardProps {
  client: Omit<ClientDetail, 'policies'>
  action?: ReactNode
}

function ClientIdCopyButton({ id }: { id: number }) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className="gap-1 px-1.5 font-mono font-normal text-muted-foreground"
          aria-label="Copy client ID"
          onClick={() => copy(formatClientId(id))}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {formatClientId(id)}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied!' : 'Copy client ID'}</TooltipContent>
    </Tooltip>
  )
}

export function ClientSummaryCard({ client, action }: ClientSummaryCardProps) {
  const { namedInsured, secondNamedInsured, phones, emails } = client
  const mailingAddress = pickAddress(client, 'mailing')
  const physicalAddress = pickAddress(client, 'physical')
  const mailingLines = formatAddressLines(mailingAddress)
  const physicalLines = formatAddressLines(physicalAddress)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          {clientDisplayName(client)}
          <ClientIdCopyButton id={client.id} />
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Named Insured</p>
            <CopyText
              className="text-sm"
              value={formatNameLastFirst(namedInsured)}
              label="named insured"
            />
          </div>
          {secondNamedInsured && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Second Named Insured</p>
              <CopyText
                className="text-sm"
                value={formatNameLastFirst(secondNamedInsured)}
                label="second named insured"
              />
            </div>
          )}
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Mailing Address</p>
            {mailingLines.length > 0 ? (
              <CopyText
                className="text-sm"
                value={mailingLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
                copyValue={formatAddress(mailingAddress) ?? undefined}
                label="mailing address"
              />
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Physical Address</p>
            {physicalLines.length > 0 ? (
              <CopyText
                className="text-sm"
                value={physicalLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
                copyValue={formatAddress(physicalAddress) ?? undefined}
                label="physical address"
              />
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Phones</p>
            {phones.length > 0 ? (
              phones.map((phone) => (
                <CopyText
                  key={phone.id}
                  className="block text-sm"
                  value={formatPhone(phone.phoneNumber)}
                  copyValue={phone.phoneNumber}
                  label="phone number"
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Emails</p>
            {emails.length > 0 ? (
              emails.map((email) => (
                <CopyText
                  key={email.id}
                  className="block text-sm"
                  value={email.email}
                  label="email"
                />
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
