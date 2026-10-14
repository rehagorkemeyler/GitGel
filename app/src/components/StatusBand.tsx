import type { Status } from '../lib/live'
import { t } from '../i18n'
import { StatusPill } from './StatusPill'

/** The service pill (native StatusPill): "M7, M2 · seferlerde aksama var". Tap opens the status sheet. */
export function StatusBand({ status, onOpen }: { status: Status; onOpen: () => void }) {
  if (!status.lines.length) return null
  return <StatusPill text={`${status.lines.map((l) => l.line).join(', ')} · ${t('serviceNotice')}`} onPress={onOpen} />
}
