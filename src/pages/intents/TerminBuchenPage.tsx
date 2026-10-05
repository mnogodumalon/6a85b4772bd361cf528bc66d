/**
 * Termin buchen — 4-Schritt-Wizard für den Empfang.
 * Steps: 1) Freien Termin wählen → 2) Kundendaten → 3) Leistung & Hinweise → 4) Prüfen & speichern.
 * Reads: verfuegbare_termine (noch nicht vergebene), terminbuchung. Writes: terminbuchung (via useTerminBuchenFlow).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldDate, fieldLookup, fieldText } from '@/lib/journey';
import { useTerminBuchenFlow } from '@/lib/journey/flows/TerminBuchen';
import { tx } from '@/i18n';

export default function TerminBuchenPage() {
  const [step, setStep] = useState(1);
  const flow = useTerminBuchenFlow({
    steps: { termin: 1, vorname: 2, nachname: 2, telefon: 2, email: 2, leistung: 3, besondere_wuensche: 3 },
    items: {
      termin: r => {
        const iso = fieldDate(r, 'datum_uhrzeit');
        return {
          id: r.id,
          title: iso ? format(parseISO(iso), 'dd.MM.yyyy · HH:mm') : tx('Ohne Zeitangabe'),
          subtitle: [fieldLookup(r, 'stuhl')?.label, fieldText(r, 'bemerkung')].filter(Boolean).join(' — '),
        };
      },
    },
  });
  const f = flow.forms.terminbuchung;

  return (
    <IntentWizardShell
      title={tx('Termin buchen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Einen freien Termin für eine Kundin oder einen Kunden buchen.'),
        needs: [tx('Name und Telefonnummer'), tx('Gewünschte Leistung')],
      }}
    >
      <WizardStep label={tx('Termin')} description={tx('Wähle einen noch freien Termin aus.')}>
        <EntitySelectStep
          {...flow.picks.termin.select}
          {...flow.pick('termin')}
          avatar="none"
          create={false}
          searchPlaceholder={tx('Termin suchen …')}
          emptyText={tx('Aktuell ist kein freier Termin verfügbar.')}
        />
      </WizardStep>
      <WizardStep label={tx('Kundendaten')} description={tx('Wer kommt zum Termin?')} needs={['termin']}>
        <div className="space-y-4">
          <Bound form={f} name="vorname" />
          <Bound form={f} name="nachname" />
          <Bound form={f} name="telefon" />
          <Bound form={f} name="email" />
          <StepNav onBack={() => setStep(1)} onNext={() => flow.validateStep(2)} nextStepLabel={tx('Leistung')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Leistung')} description={tx('Was soll gemacht werden? Ergänze bei Bedarf Hinweise.')} needs={['termin']}>
        <div className="space-y-4">
          <Bound form={f} name="leistung" />
          <Bound form={f} name="besondere_wuensche" rows={3} />
          <StepNav onBack={() => setStep(2)} onNext={() => flow.validateStep(3)} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Der Termin ist danach vergeben und kann nicht mehr doppelt gebucht werden.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          title={tx('Termin gebucht')}
          next={[{ label: tx('Zum Dashboard'), href: '#/' }]}
        />
      )}
    </IntentWizardShell>
  );
}
