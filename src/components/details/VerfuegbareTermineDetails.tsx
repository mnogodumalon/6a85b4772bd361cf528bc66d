import type { VerfuegbareTermine, Terminbuchung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface VerfuegbareTermineDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: VerfuegbareTermine;
  /** 1:N „Terminbuchung" (termin): VOLLE Liste — der Block filtert auf diesen Record. */
  terminbuchungList: Terminbuchung[];
  /** Zeilen-Klick → overlay.push auf das Terminbuchung-Detail (nie der Edit-Dialog). */
  onOpenTerminbuchung: (record: Terminbuchung) => void;
  /** Kontextuelles „+": öffnet den Terminbuchung-Dialog mit diesem Record vorgesetzt. */
  onAddTerminbuchung: () => void;
}

export function VerfuegbareTermineDetails({
  record,
  terminbuchungList,
  onOpenTerminbuchung,
  onAddTerminbuchung,
}: VerfuegbareTermineDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('verfuegbare_termine', 'datum_uhrzeit')} value={record.fields.datum_uhrzeit} format="datetime" />
        <RecordField label={fieldLabel('verfuegbare_termine', 'stuhl')} value={record.fields.stuhl} format="pill" />
        <RecordField label={fieldLabel('verfuegbare_termine', 'bemerkung')} value={record.fields.bemerkung} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('terminbuchung')}
        items={terminbuchungList.filter(r => extractRecordId(r.fields.termin) === record.record_id)}
        map={r => ({ name: r.fields.vorname ?? appLabel('terminbuchung'), meta: undefined })}
        onOpen={onOpenTerminbuchung}
        onAdd={onAddTerminbuchung}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.VERFUEGBARE_TERMINE} recordId={record.record_id} />
    </>
  );
}
