import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { fieldDate, fieldLookup, useStepForm, useRecordSearch, useJourneySubmit } from '@/lib/journey';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { tx, dateFnsLocale } from '@/i18n';

const SLUG = 'terminbuchung';

function BookingWizard({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const [step, setStep] = useState(1);

  const form = useStepForm('terminbuchung', {
    fields: ['termin', 'leistung', 'vorname', 'nachname', 'telefon', 'email', 'besondere_wuensche'],
    steps: { termin: 1, leistung: 2, vorname: 2, nachname: 2, telefon: 2, email: 2, besondere_wuensche: 2 },
    autoComplete: true,
  });
  const termine = useRecordSearch(port, 'verfuegbare_termine', {
    searchFields: ['bemerkung'],
    toItem: r => {
      const iso = fieldDate(r, 'datum_uhrzeit');
      const stuhl = fieldLookup(r, 'stuhl');
      return {
        id: r.id,
        title: iso ? format(parseISO(iso), 'EEEE, dd.MM.yyyy', { locale: dateFnsLocale() }) : '—',
        subtitle: [iso ? format(parseISO(iso), 'HH:mm') + ' Uhr' : '', stuhl?.label ?? ''].filter(Boolean).join(' · '),
        sort: iso ?? '',
      };
    },
  });
  const submit = useJourneySubmit(port, [{ key: 'buchung', entity: 'terminbuchung', form, primary: true }], { draftKey: 'terminbuchung' });
  const formList = [form];
  const items = [...termine.select.items].sort((x, y) => String((x as { sort?: string }).sort).localeCompare(String((y as { sort?: string }).sort)));
  const pick = form.record('termin');

  const steps: WizardStep[] = [
    { label: tx('Termin'), description: tx('Such dir einen freien Termin der nächsten zwei Wochen aus.') },
    { label: tx('Deine Daten'), description: tx('Wähle deine Leistung und sag uns, wie wir dich erreichen.') },
    { label: tx('Prüfen') },
  ];

  return (
    <IntentWizardShell steps={steps} currentStep={step} onStepChange={setStep} back={false} forms={formList} draftKey={'terminbuchung'}>
      {step === 1 && (
        <>
          <Field form={form} name="termin">
            <EntitySelectStep {...termine.select} items={items} id={pick.id} invalid={pick.invalid} selectedId={pick.value} onSelect={id => form.set('termin', id, termine.labelOf(id))} avatar="none" create={false} />
          </Field>
          <StepNav hideBack onNext={() => form.validate(['termin'])} nextStepLabel={tx('Deine Daten')} />
        </>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <Bound form={form} name="leistung" />
          <Bound form={form} name="vorname" />
          <Bound form={form} name="nachname" />
          <Bound form={form} name="telefon" />
          <Bound form={form} name="email" />
          <Bound form={form} name="besondere_wuensche" />
          <StepNav onBack={() => setStep(1)} onNext={() => form.validate(['leistung', 'vorname', 'nachname', 'telefon', 'email'])} nextStepLabel={tx('Prüfen')} />
        </div>
      )}
      {step === 3 && !submit.done && (
        <SummaryStep
          forms={formList}
          submit={submit}
          whatHappensNext={tx('Wir bestätigen deinen Termin kurzfristig. Bei Fragen melden wir uns telefonisch bei dir.')}
        />
      )}
      {submit.result && (
        <SuccessStep result={submit.result} forms={formList} submit={submit} />
      )}
    </IntentWizardShell>
  );
}

export default function TerminOnlineBuchen() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(e => {
        if (e instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  if (loading || unavailable || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  return (
    <PublicShell title={page.title} description={tx('Such dir einen freien Termin aus und sag uns, was du brauchst.')}>
      <BookingWizard cfg={cfg} page={page} />
    </PublicShell>
  );
}
