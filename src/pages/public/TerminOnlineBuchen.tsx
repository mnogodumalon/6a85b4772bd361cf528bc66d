import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm, useJourneySubmit, useRecordSearch, fieldLookup, fieldDate, fieldRef, recordIdOf,
  type JourneyRecord,
} from '@/lib/journey';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { tx } from '@/i18n';

const SLUG = 'terminbuchung';
const STEP_OF: Record<string, number> = {
  termin: 1, vorname: 2, nachname: 2, telefon: 2, email: 2, leistung: 2, besondere_wuensche: 2,
};

function slotTitle(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

export default function TerminOnlineBuchen() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    });
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return <Booking cfg={cfg} page={page} />;
}

function Booking({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const [step, setStep] = useState(1);
  const [booked, setBooked] = useState<Set<string> | null>(null);
  const [bookedError, setBookedError] = useState(false);

  const form = useStepForm('terminbuchung', {
    fields: ['vorname', 'nachname', 'telefon', 'email', 'termin', 'leistung', 'besondere_wuensche'],
    steps: STEP_OF,
    autoComplete: true,
  });
  const submit = useJourneySubmit(
    port,
    [{ key: 'terminbuchung', entity: 'terminbuchung', form, primary: true }],
    { draftKey: SLUG },
  );

  const search = useRecordSearch(port, 'verfuegbare_termine', {
    searchFields: ['bemerkung'],
    toItem: (r: JourneyRecord) => ({
      id: r.id,
      title: slotTitle(fieldDate(r, 'datum_uhrzeit') ?? (r.fields.datum_uhrzeit as string | undefined) ?? null),
      subtitle: fieldLookup(r, 'stuhl')?.label,
    }),
  });

  const loadBooked = useCallback(() => {
    port.list('terminbuchung', { limit: 500 })
      .then(rows => {
        const ids = new Set<string>();
        for (const r of rows) {
          const id = recordIdOf(fieldRef(r, 'termin'));
          if (id) ids.add(id);
        }
        setBooked(ids);
        setBookedError(false);
      })
      .catch(() => setBookedError(true));
  }, [port]);

  useEffect(() => { loadBooked(); }, [loadBooked]);
  useEffect(() => { if (submit.done) loadBooked(); }, [submit.done, loadBooked]);

  const items = useMemo(() => {
    if (!booked) return [];
    const byDate = new Map(search.records.map(r => [r.id, String(r.fields.datum_uhrzeit ?? '')]));
    return search.select.items
      .filter(i => !booked.has(i.id))
      .sort((a, b) => (byDate.get(a.id) ?? '').localeCompare(byDate.get(b.id) ?? ''));
  }, [booked, search.select.items, search.records]);

  const pickId = typeof form.get('termin') === 'string' ? (form.get('termin') as string) : null;
  const pickSlot = (id: string) =>
    (form.set as (k: string, v: unknown, l?: string) => void)('termin', id, search.labelOf(id));

  const validateStep = (n: number) => form.validate(form.keys.filter(k => STEP_OF[k] === n));

  const steps = [
    { label: tx('Termin'), heading: tx('Wähle deinen Termin'), description: tx('Das sind die freien Termine der nächsten zwei Wochen.') },
    { label: tx('Deine Daten'), heading: tx('Wer kommt zu uns?') },
    { label: tx('Prüfen'), heading: tx('Alles richtig?') },
  ];

  return (
    <PublicShell title={page.title} description={page.description}>
      <IntentWizardShell
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[form]}
        draftKey={SLUG}
      >
        {step === 1 && (
          <>
            {bookedError ? (
              <p className="text-sm text-destructive">{tx('Die freien Termine konnten gerade nicht geladen werden. Bitte versuche es später noch einmal.')}</p>
            ) : (
              <EntitySelectStep
                {...search.select}
                items={items}
                loading={search.select.loading || booked === null}
                create={false}
                avatar="none"
                mode="cards"
                emptyText={tx('Aktuell sind keine freien Termine verfügbar.')}
                id={form.fieldId('termin')}
                invalid={!!form.error('termin')}
                selectedId={pickId}
                onSelect={pickSlot}
              />
            )}
            {form.error('termin') && <p className="mt-2 text-sm text-destructive">{form.error('termin')}</p>}
            <StepNav hideBack onNext={() => validateStep(1)} nextStepLabel={tx('Deine Daten')} />
          </>
        )}
        {step === 2 && (
          <>
            <div className="space-y-4">
              <Bound form={form} name="vorname" />
              <Bound form={form} name="nachname" />
              <Bound form={form} name="telefon" />
              <Bound form={form} name="email" />
              <Bound
                form={form}
                name="leistung"
                hint={tx('Färben dauert länger als Schneiden — wir planen die Zeit dafür ein.')}
              />
              <Bound form={form} name="besondere_wuensche" />
            </div>
            <StepNav onBack={() => setStep(1)} onNext={() => validateStep(2)} nextStepLabel={tx('Prüfen')} />
          </>
        )}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[form]}
            submit={submit}
            whatHappensNext={tx('Dein Termin ist nach dem Absenden für dich reserviert.')}
          />
        )}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[form]}
            submit={submit}
            whatHappensNext={tx('Wir freuen uns auf dich!')}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
