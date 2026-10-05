import type { Terminbuchung, VerfuegbareTermine } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { usePermissions } from '@/lib/permissions';

export interface TerminbuchungDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Terminbuchung;
  /** N:1-Ziel „VerfuegbareTermine": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  verfuegbareTermineList: VerfuegbareTermine[];
  /** Klick auf die VerfuegbareTermine-Relation → overlay.push auf dessen Detail. */
  onOpenVerfuegbareTermine?: (record: VerfuegbareTermine) => void;
}

export function TerminbuchungDetails({
  record,
  verfuegbareTermineList,
  onOpenVerfuegbareTermine,
}: TerminbuchungDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const terminTarget = verfuegbareTermineList.find(r => r.record_id === extractRecordId(record.fields.termin));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('terminbuchung', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('terminbuchung', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('terminbuchung', 'telefon')} value={record.fields.telefon} format="text" />
        <RecordField label={fieldLabel('terminbuchung', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('terminbuchung', 'leistung')} value={record.fields.leistung} format="pill" />
        <RecordField label={fieldLabel('terminbuchung', 'besondere_wuensche')} value={record.fields.besondere_wuensche} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('terminbuchung', 'termin')}
          name={terminTarget?.fields.bemerkung ?? '—'}
          meta={undefined}
          onClick={terminTarget && onOpenVerfuegbareTermine ? () => onOpenVerfuegbareTermine!(terminTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.TERMINBUCHUNG} recordId={record.record_id} readOnly={!perms.canWrite('terminbuchung')} />
    </>
  );
}
