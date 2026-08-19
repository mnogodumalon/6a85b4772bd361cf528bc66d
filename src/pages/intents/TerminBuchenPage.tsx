/**
 * Termin buchen — 3-Schritt-Wizard (interner Salon-Workflow).
 * Steps: 1) Freien Termin wählen → 2) Leistung & Kundendaten eingeben → 3) Bestätigen & Buchung anlegen.
 * Reads: verfuegbareTermine, terminbuchung (für Anti-Join: nur unbelegte Slots zeigen).
 * Writes: terminbuchung (createTerminbuchungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState, useMemo } from 'react';
import { format, parseISO, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { tx, dateFnsLocale } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import type { VerfuegbareTermine } from '@/types/app';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  IconCalendar,
  IconUser,
  IconPhone,
  IconMail,
  IconScissors,
  IconCheck,
  IconChevronRight,
} from '@tabler/icons-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const LEISTUNG_OPTIONS = LOOKUP_OPTIONS['terminbuchung']?.['leistung'] ?? [];

// ─── Component ───────────────────────────────────────────────────────────────

export default function TerminBuchenPage() {
  const data = useDashboardData();
  const { verfuegbareTermine, terminbuchung, loading, error, fetchAll } = data;

  // ── Wizard step
  const [step, setStep] = useState(1);

  // ── Step 1 state
  const [selectedTermin, setSelectedTermin] = useState<VerfuegbareTermine | null>(null);

  // ── Step 2 state
  const [leistungKey, setLeistungKey] = useState(LEISTUNG_OPTIONS[0]?.key ?? '');
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [telefon, setTelefon] = useState('');
  const [email, setEmail] = useState('');
  const [besondereWuensche, setBesondereWuensche] = useState('');

  // ── Step 3 submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [buchungId, setBuchungId] = useState<string | null>(null);

  // ── Anti-join: build set of booked termin IDs from existing terminbuchung records
  const bookedTerminIds = useMemo(() => {
    const ids = new Set<string>();
    for (const buchung of terminbuchung) {
      const terminUrl = buchung.fields.termin;
      if (terminUrl) {
        const id = extractRecordId(terminUrl);
        if (id) ids.add(id);
      }
    }
    return ids;
  }, [terminbuchung]);

  // ── Filter: only free slots in this week and next week
  const freieTermine = useMemo(() => {
    const now = new Date();
    const startThisWeek = startOfWeek(now, { weekStartsOn: 1 });
    const endNextWeek = endOfWeek(addDays(startThisWeek, 7), { weekStartsOn: 1 });

    return verfuegbareTermine.filter((termin) => {
      if (bookedTerminIds.has(termin.record_id)) return false;
      if (!termin.fields.datum_uhrzeit) return false;
      const d = parseISO(termin.fields.datum_uhrzeit);
      return d >= startThisWeek && d <= endNextWeek;
    });
  }, [verfuegbareTermine, bookedTerminIds]);

  // ── Sort free slots by date ascending
  const sortedFreieTermine = useMemo(() => {
    return [...freieTermine].sort((a, b) => {
      const da = a.fields.datum_uhrzeit ?? '';
      const db = b.fields.datum_uhrzeit ?? '';
      return da.localeCompare(db);
    });
  }, [freieTermine]);

  // ── Build EntitySelectStep items (grouped display via subtitle)
  const terminItems = useMemo(() => {
    return sortedFreieTermine.map((termin) => {
      const dt = termin.fields.datum_uhrzeit
        ? parseISO(termin.fields.datum_uhrzeit)
        : null;
      const datumLabel = dt
        ? format(dt, 'EEEE, d. MMMM yyyy', { locale: dateFnsLocale() })
        : tx('Datum unbekannt');
      const uhrzeitLabel = dt ? format(dt, 'HH:mm') : '';
      const stuhlLabel = termin.fields.stuhl?.label ?? '';

      return {
        id: termin.record_id,
        title: datumLabel,
        subtitle: uhrzeitLabel
          ? tx`${uhrzeitLabel} Uhr · ${stuhlLabel}`
          : stuhlLabel,
        icon: <IconCalendar size={20} className="text-primary" />,
      };
    });
  }, [sortedFreieTermine]);

  // ── Handle selection in step 1
  function handleSelectTermin(id: string) {
    const found = sortedFreieTermine.find((t) => t.record_id === id) ?? null;
    setSelectedTermin(found);
    setStep(2);
  }

  // ── Validation for step 2
  const step2Valid = leistungKey && vorname.trim() && nachname.trim() && telefon.trim();

  // ── Submit in step 3
  async function handleSubmit() {
    if (!selectedTermin) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Idempotency guard: only create if we don't already have a buchungId
      let bid = buchungId;
      if (!bid) {
        const result = await LivingAppsService.createTerminbuchungEntry({
          termin: createRecordUrl(APP_IDS.VERFUEGBARE_TERMINE, selectedTermin.record_id),
          leistung: leistungKey,
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          telefon: telefon.trim(),
          email: email.trim() || undefined,
          besondere_wuensche: besondereWuensche.trim() || undefined,
        });
        bid = result.record_id;
        setBuchungId(bid);
      }
      await fetchAll();
      setStep(4);
    } catch (err) {
      setSubmitError(tx('Buchung konnte nicht gespeichert werden. Bitte erneut versuchen.'));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Reset wizard
  function handleReset() {
    setSelectedTermin(null);
    setLeistungKey(LEISTUNG_OPTIONS[0]?.key ?? '');
    setVorname('');
    setNachname('');
    setTelefon('');
    setEmail('');
    setBesondereWuensche('');
    setSubmitError(null);
    setBuchungId(null);
    setStep(1);
  }

  // ── Derived display values for summary
  const selectedDt = selectedTermin?.fields.datum_uhrzeit
    ? parseISO(selectedTermin.fields.datum_uhrzeit)
    : null;
  const selectedDatumLabel = selectedDt
    ? format(selectedDt, 'EEEE, d. MMMM yyyy', { locale: dateFnsLocale() })
    : '';
  const selectedUhrzeitLabel = selectedDt ? format(selectedDt, 'HH:mm') : '';
  const selectedStuhlLabel = selectedTermin?.fields.stuhl?.label ?? '';
  const selectedLeistungLabel =
    LEISTUNG_OPTIONS.find((o) => o.key === leistungKey)?.label ?? leistungKey;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <IntentWizardShell
      title={tx('Termin buchen')}
      subtitle={tx('Slot auswählen, Leistung und Kundendaten eingeben')}
      steps={[
        { label: tx('Termin') },
        { label: tx('Kundendaten') },
        { label: tx('Bestätigung') },
      ]}
      currentStep={Math.min(step, 3)}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Termin auswählen ─────────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={terminItems}
          onSelect={handleSelectTermin}
          searchPlaceholder={tx('Datum oder Uhrzeit suchen …')}
          emptyText={tx('Keine freien Termine in dieser und nächster Woche')}
          emptyIcon={<IconCalendar size={40} className="text-muted-foreground" />}
        />
      )}

      {/* ── Step 2: Leistung & Kundendaten ──────────────────────────────── */}
      {step === 2 && (
        selectedTermin ? (
          <div className="space-y-6">
            {/* Gewählter Termin als Kontext */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-start gap-3">
              <IconCalendar size={20} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">{selectedDatumLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedUhrzeitLabel} {tx('Uhr')} · {selectedStuhlLabel}
                </p>
              </div>
            </div>

            {/* Leistung */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{tx('Leistung')}<span className="text-destructive ml-0.5">*</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {LEISTUNG_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setLeistungKey(opt.key)}
                    className={[
                      'rounded-xl border p-3 text-left transition-colors',
                      leistungKey === opt.key
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-card text-foreground hover:bg-secondary',
                    ].join(' ')}
                  >
                    <IconScissors size={16} className="mb-1 shrink-0" />
                    <span className="block text-sm">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Kundendaten */}
            <div className="space-y-4">
              <p className="text-sm font-semibold text-foreground">{tx('Kontaktdaten')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vorname" className="text-sm">{tx('Vorname')}<span className="text-destructive ml-0.5">*</span></Label>
                  <div className="relative">
                    <IconUser size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
                    <Input
                      id="vorname"
                      value={vorname}
                      onChange={(e) => setVorname(e.target.value)}
                      className="pl-8"
                      placeholder={tx('Vorname')}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nachname" className="text-sm">{tx('Nachname')}<span className="text-destructive ml-0.5">*</span></Label>
                  <div className="relative">
                    <IconUser size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
                    <Input
                      id="nachname"
                      value={nachname}
                      onChange={(e) => setNachname(e.target.value)}
                      className="pl-8"
                      placeholder={tx('Nachname')}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="telefon" className="text-sm">{tx('Telefon')}<span className="text-destructive ml-0.5">*</span></Label>
                  <div className="relative">
                    <IconPhone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
                    <Input
                      id="telefon"
                      type="tel"
                      value={telefon}
                      onChange={(e) => setTelefon(e.target.value)}
                      className="pl-8"
                      placeholder={tx('Telefonnummer')}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm">{tx('E-Mail')}</Label>
                  <div className="relative">
                    <IconMail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-8"
                      placeholder={tx('E-Mail-Adresse')}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wuensche" className="text-sm">{tx('Besondere Wünsche')}</Label>
                <Textarea
                  id="wuensche"
                  value={besondereWuensche}
                  onChange={(e) => setBesondereWuensche(e.target.value)}
                  placeholder={tx('z. B. Allergien, Farbwünsche …')}
                  rows={3}
                />
              </div>
            </div>

            {/* Navigation */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
              <Button
                disabled={!step2Valid}
                onClick={() => setStep(3)}
                className="gap-1.5"
              >
                {tx('Weiter zur Bestätigung')}
                <IconChevronRight size={16} className="shrink-0" />
              </Button>
            </div>
          </div>
        ) : (
          /* Fallback if user lands here without step 1 data (deep-link ?step=2) */
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht einen gewählten Termin aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* ── Step 3: Bestätigung ──────────────────────────────────────────── */}
      {step === 3 && (
        selectedTermin && vorname && nachname ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {tx('Bitte prüfe die Angaben und lege die Buchung an.')}
            </p>

            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-card divide-y divide-border">
              {/* Termin */}
              <div className="flex items-start gap-3 p-4">
                <IconCalendar size={18} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{tx('Termin')}</p>
                  <p className="font-medium text-foreground">{selectedDatumLabel}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedUhrzeitLabel} {tx('Uhr')} · {selectedStuhlLabel}
                  </p>
                </div>
              </div>

              {/* Leistung */}
              <div className="flex items-start gap-3 p-4">
                <IconScissors size={18} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{tx('Leistung')}</p>
                  <p className="font-medium text-foreground">{selectedLeistungLabel}</p>
                </div>
              </div>

              {/* Kundendaten */}
              <div className="flex items-start gap-3 p-4">
                <IconUser size={18} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{tx('Kunde')}</p>
                  <p className="font-medium text-foreground">{vorname} {nachname}</p>
                  <p className="text-sm text-muted-foreground">{telefon}</p>
                  {email && <p className="text-sm text-muted-foreground">{email}</p>}
                  {besondereWuensche && (
                    <p className="text-sm text-muted-foreground mt-1 italic">{besondereWuensche}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Fehler */}
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            {/* Navigation */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="gap-1.5"
              >
                {submitting ? tx('Buchung wird angelegt …') : tx('Buchung anlegen')}
                {!submitting && <IconCheck size={16} className="shrink-0" />}
              </Button>
            </div>
          </div>
        ) : (
          /* Fallback: deep-link ?step=3 without prior state */
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Angaben aus den vorherigen Schritten.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* ── Step 4: Erfolg ──────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="text-center py-12 space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCheck size={40} className="text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              {tx('Buchung erfolgreich angelegt!')}
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {vorname} {nachname} {tx('wurde für')} {selectedDatumLabel} {tx('um')} {selectedUhrzeitLabel} {tx('Uhr eingetragen.')}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={handleReset} variant="outline">
              {tx('Weitere Buchung anlegen')}
            </Button>
            <Button asChild>
              <a href="#/">{tx('Zurück zum Dashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
