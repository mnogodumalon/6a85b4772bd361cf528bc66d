/**
 * Termin freigeben — 1-Schritt-Wizard.
 * Steps: 1) Slot-Daten eingeben → Slot anlegen.
 * Reads: verfuegbareTermine (Doppelbuchungs-Prüfung).
 * Writes: verfuegbareTermine (createVerfuegbareTermineEntry).
 * Composes: IntentWizardShell.
 */
import { useState } from 'react';
import { format, isAfter } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService } from '@/services/livingAppsService';
import { LOOKUP_OPTIONS } from '@/types/app';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';

export default function TerminFreigebenPage() {
  const { verfuegbareTermine, loading, error, fetchAll } = useDashboardData();

  const [datumUhrzeit, setDatumUhrzeit] = useState('');
  const [stuhl, setStuhl] = useState('');
  const [bemerkung, setBemerkung] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const STUHL_OPTIONS = LOOKUP_OPTIONS['verfuegbare_termine']?.['stuhl'] ?? [];

  const handleSubmit = async () => {
    setValidationError(null);

    if (!datumUhrzeit) {
      setValidationError(tx('Bitte Datum und Uhrzeit angeben.'));
      return;
    }
    if (!stuhl) {
      setValidationError(tx('Bitte einen Stuhl auswählen.'));
      return;
    }

    const selectedDate = new Date(datumUhrzeit);
    if (!isAfter(selectedDate, new Date())) {
      setValidationError(tx('Der Termin muss in der Zukunft liegen.'));
      return;
    }

    const formattedDatum = format(selectedDate, "yyyy-MM-dd'T'HH:mm");

    const duplicate = verfuegbareTermine.find(
      t =>
        t.fields.datum_uhrzeit === formattedDatum &&
        t.fields.stuhl?.key === stuhl,
    );
    if (duplicate) {
      setValidationError(tx('Dieser Slot existiert bereits'));
      return;
    }

    setSubmitting(true);
    try {
      await LivingAppsService.createVerfuegbareTermineEntry({
        datum_uhrzeit: formattedDatum,
        stuhl,
        bemerkung: bemerkung || undefined,
      });
      await fetchAll();
      setSuccess(true);
    } catch {
      setValidationError(tx('Fehler beim Anlegen des Slots. Bitte erneut versuchen.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setDatumUhrzeit('');
    setStuhl('');
    setBemerkung('');
    setValidationError(null);
    setSuccess(false);
  };

  return (
    <IntentWizardShell
      title={tx('Termin freigeben')}
      subtitle={tx('Neuen freien Slot für Buchungen anlegen')}
      steps={[{ label: tx('Slot anlegen') }]}
      currentStep={1}
      onStepChange={() => {}}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {success ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <IconCircleCheck size={48} className="text-emerald-500" />
          <h2 className="text-xl font-semibold text-foreground">{tx('Slot erfolgreich angelegt!')}</h2>
          <p className="text-sm text-muted-foreground">
            {tx('Der freie Termin steht jetzt für Buchungen bereit.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Button onClick={handleReset} variant="outline">
              {tx('Weiteren Slot anlegen')}
            </Button>
            <Button asChild>
              <a href="#/">{tx('Zurück zum Dashboard')}</a>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 max-w-md mx-auto">
          <div className="space-y-2">
            <Label htmlFor="datum_uhrzeit">{tx('Datum und Uhrzeit')}</Label>
            <Input
              id="datum_uhrzeit"
              type="datetime-local"
              value={datumUhrzeit}
              onChange={e => setDatumUhrzeit(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stuhl">{tx('Stuhl')}</Label>
            <Select value={stuhl} onValueChange={setStuhl}>
              <SelectTrigger id="stuhl" className="w-full">
                <SelectValue placeholder={tx('Stuhl auswählen')} />
              </SelectTrigger>
              <SelectContent>
                {STUHL_OPTIONS.map(opt => (
                  <SelectItem key={opt.key} value={opt.key}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bemerkung">{tx('Interne Notiz (optional)')}</Label>
            <Textarea
              id="bemerkung"
              value={bemerkung}
              onChange={e => setBemerkung(e.target.value)}
              placeholder={tx('Optionale Bemerkung für das Team')}
              rows={3}
              className="w-full resize-none"
            />
          </div>

          {validationError && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <IconAlertCircle size={16} className="shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || !datumUhrzeit || !stuhl}
            className="w-full"
          >
            {submitting ? tx('Wird angelegt …') : tx('Slot anlegen')}
          </Button>
        </div>
      )}
    </IntentWizardShell>
  );
}
