import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, prepareChallenge,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import {
  useStepForm, useJourneySubmit, useRecordSearch, fieldDate, fieldLookup,
  type JourneyRecord,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { tx, dateFnsLocale } from '@/i18n';

const SLUG = 'terminbuchung';

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
  return (
    <PublicShell title={page.title} description={page.description}>
      <Booking cfg={cfg} page={page} />
    </PublicShell>
  );
}

function Booking({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const [step, setStep] = useState(1);
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);

  const form = useStepForm('terminbuchung', {
    fields: ['termin', 'vorname', 'nachname', 'telefon', 'email', 'leistung', 'besondere_wuensche'],
    steps: { termin: 1, vorname: 2, nachname: 2, telefon: 2, email: 2, leistung: 2, besondere_wuensche: 2 },
    autoComplete: true,
  });

  const slots = useRecordSearch(port, 'verfuegbare_termine', {
    searchFields: ['bemerkung'], // not exposed publicly; the slot list is short, so no search box is needed
    orderby: ['r.v_datum_uhrzeit'],
    toItem: (r: JourneyRecord) => {
      const iso = fieldDate(r, 'datum_uhrzeit');
      const d = iso ? parseISO(iso) : null;
      const stuhl = fieldLookup(r, 'stuhl');
      return {
        id: r.id,
        title: d ? format(d, "EEEE, dd.MM.yyyy", { locale: dateFnsLocale() }) : '—',
        subtitle: [d ? format(d, 'HH:mm') + ' Uhr' : '', stuhl?.label ?? ''].filter(Boolean).join(' · '),
      };
    },
  });

  const items = useMemo(
    () => [...slots.select.items].sort((a, b) => {
      const ra = slots.recordOf(a.id);
      const rb = slots.recordOf(b.id);
      return (ra ? fieldDate(ra, 'datum_uhrzeit') ?? '' : '').localeCompare(rb ? fieldDate(rb, 'datum_uhrzeit') ?? '' : '');
    }),
    [slots],
  );

  const submit = useJourneySubmit(
    port,
    [{ key: 'terminbuchung', entity: 'terminbuchung', form, primary: true }],
    { draftKey: 'termin-online-buchen' },
  );

  const STEPS = [
    { label: tx('Termin') },
    { label: tx('Deine Daten') },
    { label: tx('Prüfen') },
  ];

  const pickedId = typeof form.get('termin') === 'string' ? (form.get('termin') as string) : null;

  return (
    <IntentWizardShell
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      back={false}
      forms={[form]}
      draftKey="termin-online-buchen"
    >
      {step === 1 && (
        <>
          <EntitySelectStep
            {...slots.select}
            items={items}
            id={form.fieldId('termin')}
            invalid={!!form.error('termin')}
            avatar="none"
            create={false}
            selectedId={pickedId}
            onSelect={id => (form.set as (k: string, v: unknown, l?: string) => void)('termin', id, slots.labelOf(id))}
            emptyText={tx('Aktuell sind keine freien Termine verfügbar. Schau bitte später noch einmal vorbei.')}
          />
          <StepNav
            hideBack
            onNext={() => {
              prepareChallenge(cfg, page, 'POST', `/apps/${page.endpoints?.find(e => e.op === 'create')?.app_id}/records`);
              return form.validate(['termin']);
            }}
            nextStepLabel={tx('Deine Daten')}
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
            onNext={() => form.validate(['leistung', 'vorname', 'nachname', 'telefon', 'email', 'besondere_wuensche'])}
            nextStepLabel={tx('Prüfen')}
          />
        </>
      )}
      {step === 3 && !submit.done && (
        <SummaryStep
          forms={[form]}
          submit={submit}
          whatHappensNext={tx('Wir reservieren deinen Termin und melden uns bei Rückfragen.')}
        />
      )}
      {submit.result && (
        <SuccessStep result={submit.result} forms={[form]} submit={submit} />
      )}
    </IntentWizardShell>
  );
}
