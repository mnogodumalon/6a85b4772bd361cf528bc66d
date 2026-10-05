/**
 * EntityCrud — pre-generated CRUD + overlay plumbing for the dashboard.
 * Compose it; NEVER re-roll dialog state, submit handlers, an overlay stack
 * or a RecordOverlayHost in the page — this file owns all of it.
 *
 * API at a glance:
 *   const data = useDashboardData();
 *   const crud = useEntityCrud(data, {
 *     // optional — the ONE semantic slot on the overlay: the record's next
 *     // workflow step. Return undefined for types without one.
 *     footer: (top) => top.type === 'verfuegbareTermine'
 *       ? { label: …, onClick: () => … }
 *       : undefined,
 *   });
 *
 *   `top.type` is the SAME camelCase key as `crud.<entity>` — one spelling
 *   per entity, everywhere in this API.
 *   …
 *   crud.verfuegbareTermine.openCreate({ …defaults })   // create dialog, prefilled — defaults are
 *                                       // shape-tolerant: bare lookup keys / record ids are fine
 *   crud.verfuegbareTermine.openEdit(record)            // edit dialog (recordId + defaults wired)
 *   crud.verfuegbareTermine.openDetail(record)          // record overlay — pass the RAW record,
 *                                       // enrichment is resolved inside
 *   crud.overlay                         // RecordOverlayStack<OverlayItem> for drills:
 *                                       // push / pop / replace / close
 *   crud.enriched.verfuegbareTermine              // the display-ready array for EVERY entity —
 *                                       // Enriched* where relations exist, the raw array
 *                                       // otherwise. Reuse these; never call enrich*()
 *                                       // in the page, and never guess which entity has
 *                                       // one: they all do.
 *   {crud.surfaces}                      // render ONCE at the end of the page JSX:
 *                                       // all entity dialogs + the overlay host
 *
 * Built in (do NOT re-implement): optimistic update + Rückgängig counter-write
 * on edit, fetchAll-on-error, edit-from-overlay, and per-entity overlay bodies
 * (RecordHeader + <{Entity}Details> with every relation reachable and the
 * contextual "+" prefilled; list-field back-references additionally get a
 * "choose existing" picker that links an EXISTING record — built in, do not
 * re-roll). Drag writes (onEventDrop/onCardMove) stay YOURS:
 * optimistic setter first, PATCH in background, undoToast with counter-write.
 *
 * Overlay content per entity (the host renders these — you never compose
 * Details blocks yourself):
 *   verfuegbare_termine: datum_uhrzeit, stuhl, bemerkung  ·  ← terminbuchung (list + contextual +)
 *   terminbuchung: vorname, nachname, telefon, email, termin, leistung, besondere_wuensche  ·  → verfuegbare_termine
 */
import { useState, useMemo, type ReactNode } from 'react';
import type { VerfuegbareTermine, Terminbuchung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { enrichTerminbuchung } from '@/lib/enrich';
import type { EnrichedTerminbuchung } from '@/types/enriched';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader,
  type RecordOverlayStack,
} from '@/components/widgets/RecordView';
import { VerfuegbareTermineDialog, type VerfuegbareTermineDialogDefaults } from '@/components/dialogs/VerfuegbareTermineDialog';
import { VerfuegbareTermineDetails } from '@/components/details/VerfuegbareTermineDetails';
import { TerminbuchungDialog, type TerminbuchungDialogDefaults } from '@/components/dialogs/TerminbuchungDialog';
import { TerminbuchungDetails } from '@/components/details/TerminbuchungDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel } from '@/i18n';
import { undoToast } from '@/lib/polish';
import { usePermissions } from '@/lib/permissions';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatters';

// The overlay union — one branch per entity, `record` typed the way the data
// flows: Enriched* where enrichment exists, the raw record type otherwise.
// The host resolves enrichment itself; pages pass raw records everywhere.
export type OverlayItem =
  | { type: 'verfuegbareTermine'; record: VerfuegbareTermine }
  | { type: 'terminbuchung'; record: EnrichedTerminbuchung };

/** The useDashboardData() return — pass it in, never re-fetch inside. */
export type EntityCrudData = ReturnType<typeof useDashboardData>;

export interface EntityCrudOptions {
  /** Per-type overlay footer — the record's next workflow step. */
  footer?: (top: OverlayItem) => ReactNode | { label: ReactNode; onClick: () => void } | undefined;
  placement?: 'side' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface EntityCrudApi<TRecord, TDefaults> {
  /** Open the create dialog, optionally prefilled (shape-tolerant defaults). */
  openCreate: (defaults?: TDefaults) => void;
  /** Open the edit dialog for a record (recordId + defaults are wired). */
  openEdit: (record: TRecord) => void;
  /** Open the record overlay (raw record is fine — enrichment resolved inside). */
  openDetail: (record: TRecord) => void;
  /** May the signed-in user create/change records of this list? (the
   *  platform's rights — show a „+ Neu“ only when true; openCreate/openEdit
   *  refuse with a notice otherwise). */
  canWrite: boolean;
}

export interface EntityCrud {
  /** The overlay stack for drills: push / pop / replace / close. */
  overlay: RecordOverlayStack<OverlayItem>;
  /** Render ONCE at the end of the page JSX — all dialogs + the overlay host. */
  surfaces: ReactNode;
  verfuegbareTermine: EntityCrudApi<VerfuegbareTermine, VerfuegbareTermineDialogDefaults>;
  terminbuchung: EntityCrudApi<Terminbuchung, TerminbuchungDialogDefaults>;
  /** The display-ready array per entity: Enriched* where an enrich function
   *  exists, the raw array otherwise. One key per entity so no page has to
   *  know which is which. Reuse these; never re-enrich in the page. */
  enriched: { verfuegbareTermine: VerfuegbareTermine[]; terminbuchung: EnrichedTerminbuchung[] };
}

export function useEntityCrud(data: EntityCrudData, options?: EntityCrudOptions): EntityCrud {
  const overlay = useRecordOverlayStack<OverlayItem>();
  // the platform's rights of the signed-in user (lib/permissions.ts) — unknown = allowed
  const perms = usePermissions();
  const refuse = () => { toast.error(t('perm_denied_title'), { description: t('perm_denied_desc') }); };
  const [verfuegbareTermineDialog, setVerfuegbareTermineDialog] = useState<{ defaults?: VerfuegbareTermineDialogDefaults; editing?: VerfuegbareTermine } | null>(null);
  const [terminbuchungDialog, setTerminbuchungDialog] = useState<{ defaults?: TerminbuchungDialogDefaults; editing?: Terminbuchung } | null>(null);
  const enrichedTerminbuchung = useMemo(() => enrichTerminbuchung(data.terminbuchung, { verfuegbareTermineMap: data.verfuegbareTermineMap }), [data.terminbuchung, data.verfuegbareTermineMap]);

  function detailVerfuegbareTermine(record: VerfuegbareTermine, push = false) {
    const item: OverlayItem = { type: 'verfuegbareTermine', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitVerfuegbareTermine(fields: VerfuegbareTermine['fields']) {
    const editing = verfuegbareTermineDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setVerfuegbareTermine(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateVerfuegbareTermineEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('verfuegbare_termine')} — ${t('crud_updated')}`, async () => {
        data.setVerfuegbareTermine(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateVerfuegbareTermineEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createVerfuegbareTermineEntry(fields);
      undoToast(`${appLabel('verfuegbare_termine')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailTerminbuchung(record: Terminbuchung, push = false) {
    const rec = enrichedTerminbuchung.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'terminbuchung', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitTerminbuchung(fields: Terminbuchung['fields']) {
    const editing = terminbuchungDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setTerminbuchung(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateTerminbuchungEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('terminbuchung')} — ${t('crud_updated')}`, async () => {
        data.setTerminbuchung(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateTerminbuchungEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createTerminbuchungEntry(fields);
      undoToast(`${appLabel('terminbuchung')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  const surfaces = (
    <>
      <VerfuegbareTermineDialog
        open={verfuegbareTermineDialog !== null}
        onClose={() => setVerfuegbareTermineDialog(null)}
        onSubmit={submitVerfuegbareTermine}
        defaultValues={verfuegbareTermineDialog?.defaults}
        recordId={verfuegbareTermineDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['VerfuegbareTermine']}
        enablePhotoLocation={AI_PHOTO_LOCATION['VerfuegbareTermine']}
      />
      <TerminbuchungDialog
        open={terminbuchungDialog !== null}
        onClose={() => setTerminbuchungDialog(null)}
        onSubmit={submitTerminbuchung}
        defaultValues={terminbuchungDialog?.defaults}
        recordId={terminbuchungDialog?.editing?.record_id}
        verfuegbareTermineList={data.verfuegbareTermine}
        enablePhotoScan={AI_PHOTO_SCAN['Terminbuchung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Terminbuchung']}
      />
      <RecordOverlayHost
        overlay={overlay}
        placement={options?.placement}
        size={options?.size}
        footer={options?.footer}
        render={(top) => {
          if (top.type === 'verfuegbareTermine') {
            return (
              <>
                <RecordHeader title={appLabel('verfuegbare_termine')} subtitle={top.record.fields.datum_uhrzeit ? formatDate(top.record.fields.datum_uhrzeit) : undefined} />
                <VerfuegbareTermineDetails
                  record={top.record}
                  terminbuchungList={data.terminbuchung}
                  onOpenTerminbuchung={(r) => detailTerminbuchung(r, true)}
                  onAddTerminbuchung={perms.canWrite('terminbuchung') ? () => setTerminbuchungDialog({ defaults: { termin: createRecordUrl(APP_IDS.VERFUEGBARE_TERMINE, top.record.record_id) } }) : undefined}
                />
              </>
            );
          }
          if (top.type === 'terminbuchung') {
            return (
              <>
                <RecordHeader title={top.record.fields.vorname ?? appLabel('terminbuchung')} subtitle={undefined} />
                <TerminbuchungDetails
                  record={top.record}
                  verfuegbareTermineList={data.verfuegbareTermine}
                  onOpenVerfuegbareTermine={(r) => detailVerfuegbareTermine(r, true)}
                />
              </>
            );
          }
          return null;
        }}
        canEdit={(top) => {
          if (top.type === 'verfuegbareTermine') return perms.canWrite('verfuegbare_termine');
          if (top.type === 'terminbuchung') return perms.canWrite('terminbuchung');
          return true;
        }}
        onEdit={(top) => {
          overlay.close();
          if (top.type === 'verfuegbareTermine') setVerfuegbareTermineDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'terminbuchung') setTerminbuchungDialog({ editing: top.record, defaults: top.record.fields });
        }}
      />
    </>
  );

  return {
    overlay,
    surfaces,
    verfuegbareTermine: {
      openCreate: (defaults?: VerfuegbareTermineDialogDefaults) => (perms.canWrite('verfuegbare_termine') ? setVerfuegbareTermineDialog({ defaults }) : refuse()),
      openEdit: (record: VerfuegbareTermine) => (perms.canWrite('verfuegbare_termine') ? setVerfuegbareTermineDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: VerfuegbareTermine) => detailVerfuegbareTermine(record, false),
      canWrite: perms.canWrite('verfuegbare_termine'),
    },
    terminbuchung: {
      openCreate: (defaults?: TerminbuchungDialogDefaults) => (perms.canWrite('terminbuchung') ? setTerminbuchungDialog({ defaults }) : refuse()),
      openEdit: (record: Terminbuchung) => (perms.canWrite('terminbuchung') ? setTerminbuchungDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Terminbuchung) => detailTerminbuchung(record, false),
      canWrite: perms.canWrite('terminbuchung'),
    },
    enriched: { verfuegbareTermine: data.verfuegbareTermine, terminbuchung: enrichedTerminbuchung },
  };
}
