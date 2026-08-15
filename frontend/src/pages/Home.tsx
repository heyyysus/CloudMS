import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Activity, FileText, Upload, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImportQuoteDialog } from '@/components/clients/import-quote-dialog'
import { useClientTabs } from '@/components/layout/client-tabs'
import { useFileDrop, isRaterFile } from '@/hooks/use-file-drop'
import { clientDisplayName } from '@/api/clients'

const sections = [
  { title: 'Clients', icon: Users, description: 'No clients yet' },
  { title: 'Policies', icon: FileText, description: 'No policies yet' },
  { title: 'Activity', icon: Activity, description: 'No recent activity' },
]

function Home() {
  const navigate = useNavigate()
  const { openTab } = useClientTabs()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importDialogKey, setImportDialogKey] = useState(0)
  const [importFile, setImportFile] = useState<File | undefined>(undefined)
  const [rejectedFileName, setRejectedFileName] = useState<string | null>(null)

  function openImportDialog(file: File) {
    setRejectedFileName(null)
    setImportFile(file)
    setImportDialogKey((key) => key + 1)
    setImportDialogOpen(true)
  }

  const { isDraggingOver, dragHandlers } = useFileDrop((files) => {
    const file = files[0]
    if (!file) return
    if (isRaterFile(file)) {
      openImportDialog(file)
    } else {
      setRejectedFileName(file.name)
    }
  })

  return (
    <div className="relative flex flex-col gap-6" {...dragHandlers}>
      {isDraggingOver && (
        <div className="pointer-events-none fixed inset-0 z-40 m-4 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5">
          <p className="text-sm font-medium text-primary">Drop a rater file to import</p>
        </div>
      )}
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
        <Card
          className="cursor-pointer border-dashed hover:border-primary hover:bg-primary/5"
          onClick={() => fileInputRef.current?.click()}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4 text-muted-foreground" />
              Import a rater file
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Drag a TurboRater .tt2x file here, or click to choose one.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tt2x,.xml"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) openImportDialog(file)
              }}
            />
          </CardContent>
        </Card>
      </div>

      {rejectedFileName && (
        <p className="text-sm text-muted-foreground">
          "{rejectedFileName}" isn't a rater file — only .tt2x or .xml files can be imported.
        </p>
      )}

      {importFile && (
        <ImportQuoteDialog
          key={importDialogKey}
          file={importFile}
          open={importDialogOpen}
          onOpenChange={(next) => {
            setImportDialogOpen(next)
            if (!next) setImportFile(undefined)
          }}
          onImported={(client) => {
            openTab({ id: client.id, label: clientDisplayName(client) })
            navigate(`/clients/${client.id}`)
          }}
        />
      )}
    </div>
  )
}

export default Home
