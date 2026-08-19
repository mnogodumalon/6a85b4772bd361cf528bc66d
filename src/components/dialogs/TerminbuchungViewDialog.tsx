import type { Terminbuchung, VerfuegbareTermine } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Badge } from '@/components/ui/badge';
import { IconPencil } from '@tabler/icons-react';
import { t, appLabel, fieldLabel, lookupLabel } from '@/i18n';

interface TerminbuchungViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Terminbuchung | null;
  onEdit: (record: Terminbuchung) => void;
  verfuegbareTermineList: VerfuegbareTermine[];
}

export function TerminbuchungViewDialog({ open, onClose, record, onEdit, verfuegbareTermineList }: TerminbuchungViewDialogProps) {
  function getVerfuegbareTermineDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return verfuegbareTermineList.find(r => r.record_id === id)?.fields.bemerkung ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('view_entity', { entity: appLabel('terminbuchung') })}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            {t('edit_button')}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('terminbuchung', 'vorname')}</Label>
            <p className="text-sm">{record.fields.vorname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('terminbuchung', 'nachname')}</Label>
            <p className="text-sm">{record.fields.nachname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('terminbuchung', 'telefon')}</Label>
            <p className="text-sm">{record.fields.telefon ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('terminbuchung', 'email')}</Label>
            <p className="text-sm">{record.fields.email ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('terminbuchung', 'termin')}</Label>
            <p className="text-sm">{getVerfuegbareTermineDisplayName(record.fields.termin)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('terminbuchung', 'leistung')}</Label>
            <Badge variant="secondary">{lookupLabel('terminbuchung', 'leistung', record.fields.leistung?.key) ?? record.fields.leistung?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('terminbuchung', 'besondere_wuensche')}</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.besondere_wuensche ?? '—'}</p>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.TERMINBUCHUNG} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}