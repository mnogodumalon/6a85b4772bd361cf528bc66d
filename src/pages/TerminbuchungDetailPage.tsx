import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { Terminbuchung, VerfuegbareTermine } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import {
  RecordView, RecordHeader, RecordKeyFacts, RecordSection, RecordField,
  RecordAttachments, RecordViewSkeleton, RecordViewEmpty,
} from '@/components/widgets/RecordView';
import { TerminbuchungDialog } from '@/components/dialogs/TerminbuchungDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { formEnhancements } from '@/config/form-enhancements/Terminbuchung';
import { evalComputed } from '@/config/form-enhancements/types';
import { t, appLabel, fieldLabel, localeTag, CURRENCY } from '@/i18n';

export default function TerminbuchungDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<Terminbuchung | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [verfuegbareTermineList, setVerfuegbareTermineList] = useState<VerfuegbareTermine[]>([]);

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, verfuegbareTermineData] = await Promise.all([
        LivingAppsService.getTerminbuchung(),
        LivingAppsService.getVerfuegbareTermine(),
      ]);
      setVerfuegbareTermineList(verfuegbareTermineData);
      setRecord(mainData.find(r => r.record_id === id) ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(fields: Terminbuchung['fields']) {
    if (!record) return;
    await LivingAppsService.updateTerminbuchungEntry(record.record_id, fields);
    await loadData();
    setEditing(false);
  }

  async function handleDelete() {
    if (!record) return;
    await LivingAppsService.deleteTerminbuchungEntry(record.record_id);
    setDeleteOpen(false);
    navigate('/terminbuchung');
  }

  function getVerfuegbareTermineDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return verfuegbareTermineList.find(r => r.record_id === refId)?.fields.bemerkung ?? '—';
  }

  if (loading) {
    return <RecordViewSkeleton />;
  }

  if (!record) {
    return (
      <RecordViewEmpty
        title={t('not_found')}
        action={
          <Button variant="ghost" onClick={() => navigate('/terminbuchung')}>
            <IconArrowLeft className="h-4 w-4 mr-1.5" />
            {t('back')}
          </Button>
        }
      />
    );
  }

  return (
    <RecordView
      onBack={() => navigate('/terminbuchung')}
      onEdit={() => setEditing(true)}
      backLabel={t('back')}
      editLabel={t('edit_button')}
    >
      <RecordHeader title={record.fields.vorname ?? appLabel('terminbuchung')} />

      {(() => {
        const lookupLists: Record<string, unknown> = {
          termin: verfuegbareTermineList,
        };
        const fmtComputed = (k: string, n: number) =>
          /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k)
            ? n.toLocaleString(localeTag(), { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : n.toLocaleString(localeTag(), { maximumFractionDigits: 2 });
        const computedFacts = Object.entries(formEnhancements.computed)
          .map(([key, formula]) => {
            const v = evalComputed(formula, record!.fields as Record<string, unknown>, { lookupLists });
            return v != null
              ? { label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), value: fmtComputed(key, v) }
              : null;
          })
          .filter((f): f is { label: string; value: string } => f !== null);
        return computedFacts.length > 0 ? <RecordKeyFacts items={computedFacts} /> : null;
      })()}

      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('terminbuchung', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('terminbuchung', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('terminbuchung', 'telefon')} value={record.fields.telefon} format="text" />
        <RecordField label={fieldLabel('terminbuchung', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('terminbuchung', 'termin')} value={getVerfuegbareTermineDisplayName(record.fields.termin)} format="text" />
        <RecordField label={fieldLabel('terminbuchung', 'leistung')} value={record.fields.leistung} format="pill" />
        <RecordField label={fieldLabel('terminbuchung', 'besondere_wuensche')} value={record.fields.besondere_wuensche} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.TERMINBUCHUNG} recordId={record.record_id} />

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
          <IconTrash className="h-4 w-4 mr-1.5" />
          {t('delete')}
        </Button>
      </div>

      <TerminbuchungDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
        defaultValues={record.fields}
        recordId={record.record_id}
        verfuegbareTermineList={verfuegbareTermineList}
        enablePhotoScan={AI_PHOTO_SCAN['Terminbuchung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Terminbuchung']}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('delete_entity', { entity: appLabel('terminbuchung') })}
        description={t('confirm_delete_desc')}
      />
    </RecordView>
  );
}
