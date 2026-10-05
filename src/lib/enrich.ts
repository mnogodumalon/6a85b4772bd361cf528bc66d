import type { EnrichedTerminbuchung } from '@/types/enriched';
import type { Terminbuchung, VerfuegbareTermine } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface TerminbuchungMaps {
  verfuegbareTermineMap: Map<string, VerfuegbareTermine>;
}

export function enrichTerminbuchung(
  terminbuchung: Terminbuchung[],
  maps: TerminbuchungMaps
): EnrichedTerminbuchung[] {
  return terminbuchung.map(r => ({
    ...r,
    terminName: resolveDisplay(r.fields.termin, maps.verfuegbareTermineMap, 'bemerkung'),
  }));
}
