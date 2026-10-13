import { Download, UploadCloud } from 'lucide-react'
import { requireCapability } from '@/utils/people/access'
import { loadSyncPlan } from '@/utils/people/import-sync'
import { PageHeader, buttonClass } from '../../_components/ui'
import { DataNote } from './_components/data-note'
import { ImportWizard } from './_components/import-wizard'
import { SupportedColumns } from './_components/supported-columns'
import { SyncCard } from './_components/sync-card'

export default async function ImportPage() {
  await requireCapability('import.run')
  const syncPlan = await loadSyncPlan()

  return (
    <>
      <PageHeader
        title="Import and sync"
        subtitle="Get your people into HR Locker from the Platinum directory, your previous HR system or any spreadsheet."
        icon={UploadCloud}
        actions={
          <a href="/api/import/template" download className={buttonClass('secondary')}>
            <Download size={16} /> Download template
          </a>
        }
      />
      <div className="space-y-6">
        <DataNote />
        <SyncCard plan={syncPlan} />
        <ImportWizard />
        <SupportedColumns />
      </div>
    </>
  )
}
