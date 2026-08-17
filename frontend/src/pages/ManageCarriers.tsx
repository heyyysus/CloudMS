import { ManageCarriersCard } from '@/components/admin/carrier-list'

function ManageCarriers() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manage Carriers</h1>
        <p className="text-muted-foreground">
          Add carriers and keep their contact and producer details current.
        </p>
      </div>
      <ManageCarriersCard />
    </div>
  )
}

export default ManageCarriers
