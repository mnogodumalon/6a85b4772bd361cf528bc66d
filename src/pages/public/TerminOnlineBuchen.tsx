import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { PublicShell } from '@/components/PublicShell';
import { tx, dateFnsLocale } from '@/i18n';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldLookup,
  fieldText,
  type JourneyRecord,
} from '@/lib/journey';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';

const SLUG = 'terminbuchung';

export default function TerminOnlineBuchen() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
      })
      .catch(() => {
        setCfg(null);
        setPage(null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return (
    <PublicShell title={page.title}>
      <Booking cfg={cfg} page={page} />
    </PublicShell>
  );
}

function slotTitle(r: JourneyRecord): string {
  const raw = fieldText(r, 'datum_uhrzeit');
  const d = raw ? new Date(raw) : null;
  if (!d || isNaN(d.getTime())) return raw;
  return format(d, 'EEEE, dd.MM.yyyy', { locale: dateFnsLocale() });
}

function slotTime(r: JourneyRecord): string {
  const raw = fieldText(r, 'datum_uhrzeit');
  const d = raw ? new Date(raw) : null;
  if (!d || isNaN(d.getTime())) return '';
  return format(d, 'HH:mm');
}

function Booking({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const [step, setStep] = useState(1);

  const form = useStepForm('terminbuchung', {
    fields: ['termin', 'vorname', 'nachname', 'telefon', 'email', 'leistung', 'besondere_wuensche'],
    steps: { termin: 1, vorname: 2, nachname: 2, telefon: 2, email: 2, leistung: 2, besondere_wuensche: 2 },
    autoComplete: true,
  });

  const slots = useRecordSearch(port, 'verfuegbare_termine', {
    searchFields: ['bemerkung'],
    toItem: r => ({
      id: r.id,
      title: `${slotTitle(r)} · ${slotTime(r)} ${tx('Uhr')}`,
      subtitle: fieldLookup(r, 'stuhl')?.label,
    }),
  });

  const items = useMemo(
    () =>
      [...slots.records]
        .sort((a, b) => fieldText(a, 'datum_uhrzeit').localeCompare(fieldText(b, 'datum_uhrzeit')))
        .map(r => ({
          id: r.id,
          title: `${slotTitle(r)} · ${slotTime(r)} ${tx('Uhr')}`,
          subtitle: fieldLookup(r, 'stuhl')?.label,
        })),
    [slots.records],
  );

  const submit = useJourneySubmit(
    port,
    [{ key: 'buchung', entity: 'terminbuchung', form, primary: true }],
    { draftKey: SLUG },
  );

  const steps = [
    { label: tx('Termin') },
    { label: tx('Deine Angaben') },
    { label: tx('Prüfen') },
  ];

  const picked = form.get('termin') as string | null;

  return (
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
          <EntitySelectStep
            {...slots.select}
            items={items}
            id={form.fieldId('termin')}
            avatar="none"
            emptyText={tx('Aktuell sind keine freien Termine verfügbar.')}
            selectedId={picked}
            onSelect={id => form.set('termin', id, items.find(i => i.id === id)?.title ?? '')}
          />
          <StepNav
            hideBack
            onNext={() => form.validate(['termin'])}
            nextStepLabel={tx('Deine Angaben')}
          />
        </>
      )}
      {step === 2 && (
        <>
          <div className="space-y-4">
            <Bound form={form} name="leistung" />
            <Bound form={form} name="vorname" />
            <Bound form={form} name="nachname" />
            <Bound form={form} name="telefon" />
            <Bound form={form} name="email" />
            <Bound form={form} name="besondere_wuensche" />
          </div>
          <StepNav
            onBack={() => setStep(1)}
            onNext={() =>
              form.validate(['vorname', 'nachname', 'telefon', 'email', 'leistung', 'besondere_wuensche'])
            }
            nextStepLabel={tx('Prüfen')}
          />
        </>
      )}
      {step === 3 && !submit.done && (
        <SummaryStep
          forms={[form]}
          submit={submit}
          whatHappensNext={tx('Dein Termin wird für dich reserviert. Wir freuen uns auf dich!')}
        />
      )}
      {submit.result && (
        <SuccessStep result={submit.result} forms={[form]} submit={submit} />
      )}
    </IntentWizardShell>
  );
}
