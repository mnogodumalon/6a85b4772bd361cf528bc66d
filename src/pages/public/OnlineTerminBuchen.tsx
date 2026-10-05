import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm, useJourneySubmit, useRecordSearch, fieldDate, fieldLookup,
  type JourneyPort,
} from '@/lib/journey';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';

const SLUG = 'terminbuchung';

function Wizard({ port }: { port: JourneyPort }) {
  const [step, setStep] = useState(1);
  const form = useStepForm('terminbuchung', {
    fields: ['termin', 'vorname', 'nachname', 'telefon', 'email', 'leistung', 'besondere_wuensche'],
    steps: { termin: 1, vorname: 2, nachname: 2, telefon: 2, email: 2, leistung: 2, besondere_wuensche: 2 },
    autoComplete: true,
  });
  const slots = useRecordSearch(port, 'verfuegbare_termine', {
    searchFields: ['bemerkung'],
    toItem: r => {
      const iso = fieldDate(r, 'datum_uhrzeit');
      const d = iso ? new Date(iso) : null;
      const valid = d && !isNaN(d.getTime());
      return {
        id: r.id,
        title: valid ? format(d, 'dd.MM.yyyy') : r.id,
        subtitle: [valid ? tx`${format(d, 'HH:mm')} Uhr` : '', fieldLookup(r, 'stuhl')?.label ?? '']
          .filter(Boolean).join(' · '),
      };
    },
  });
  const submit = useJourneySubmit(
    port,
    [{ key: 'buchung', entity: 'terminbuchung', form, primary: true }],
    { draftKey: SLUG },
  );

  const steps = [
    { label: tx('Termin wählen') },
    { label: tx('Deine Daten') },
    { label: tx('Prüfen') },
  ];

  const restart = () => {
    submit.reset();
    form.reset();
    setStep(1);
  };

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
            avatar="none"
            columns={2}
            selectedId={(form.get('termin') as string) || null}
            onSelect={id => form.set('termin', id, slots.labelOf(id))}
            emptyText={tx('Aktuell sind keine freien Termine verfügbar. Schau bitte später noch einmal vorbei.')}
          />
          <StepNav hideBack onNext={() => form.validate(['termin'])} nextStepLabel={tx('Deine Daten')} />
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
              hint={tx('Färben dauert länger als Schneiden — wähle die passende Leistung.')}
            />
            <Bound form={form} name="besondere_wuensche" />
          </div>
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => form.validate(['vorname', 'nachname', 'telefon', 'email', 'leistung', 'besondere_wuensche'])}
            nextStepLabel={tx('Prüfen')}
          />
        </>
      )}
      {step === 3 && !submit.done && (
        <SummaryStep
          forms={[form]}
          submit={submit}
          whatHappensNext={tx('Nach dem Absenden ist dein Termin für dich reserviert.')}
        />
      )}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[form]}
          submit={submit}
          next={[{ label: tx('Weiteren Termin buchen'), onClick: restart }]}
        />
      )}
    </IntentWizardShell>
  );
}

export default function OnlineTerminBuchen() {
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

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  if (loading || !cfg || !page || !port) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  return (
    <PublicShell title={page.title} description={page.description}>
      <Wizard port={port} />
    </PublicShell>
  );
}
