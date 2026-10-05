/**
 * Freie Termine anlegen — 4-Schritt-Wizard.
 * Steps: 1) Datum und Uhrzeit → 2) Stuhl wählen (Überschneidungs-Check) → 3) Bemerkung → 4) Prüfen & speichern.
 * Reads: verfuegbare_termine (Überschneidung pro Stuhl). Writes: verfuegbare_termine.
 * Composes: IntentWizardShell, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldDate, fieldLookup } from '@/lib/journey';
import { useFreieTermineAnlegenFlow } from '@/lib/journey/flows/FreieTermineAnlegen';
import { tx } from '@/i18n';

export default function FreieTermineAnlegenPage() {
  const [step, setStep] = useState(1);
  const flow = useFreieTermineAnlegenFlow({
    steps: { datum_uhrzeit: 1, stuhl: 2, bemerkung: 3 },
  });
  const f = flow.forms.verfuegbare_termine;

  // Check vor dem Schreiben: pro Stuhl nur ein Termin zur gleichen Zeit
  const checkOverlap = async (): Promise<boolean | string> => {
    if (!flow.validateStep(2)) return false;
    const when = String(f.get('datum_uhrzeit') ?? '').slice(0, 16);
    const chair = String(f.get('stuhl') ?? '');
    const existing = await flow.port.list('verfuegbare_termine', { limit: 500 });
    const clash = existing.some(
      r => (fieldDate(r, 'datum_uhrzeit') ?? '').slice(0, 16) === when && fieldLookup(r, 'stuhl')?.key === chair,
    );
    return clash ? tx('Für diesen Stuhl gibt es zu dieser Zeit schon einen Termin.') : true;
  };

  return (
    <IntentWizardShell
      title={tx('Freie Termine anlegen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Lege freie Termine an, damit Kunden sie buchen können.'),
        needs: [tx('Datum und Uhrzeit'), tx('Stuhl')],
      }}
    >
      <WizardStep label={tx('Zeit')} description={tx('Wann ist der Termin frei?')}>
        <div className="space-y-4">
          <Bound form={f} name="datum_uhrzeit" />
          <StepNav hideBack onNext={() => flow.validateStep(1)} nextStepLabel={tx('Stuhl')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Stuhl')} description={tx('Auf welchem Stuhl findet der Termin statt?')} needs={['datum_uhrzeit']}>
        <div className="space-y-4">
          <Bound form={f} name="stuhl" />
          <StepNav onBack={() => setStep(1)} onNext={checkOverlap} nextStepLabel={tx('Bemerkung')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Bemerkung')} description={tx('Optional: z. B. Zeitbedarf fürs Färben.')}>
        <div className="space-y-4">
          <Bound form={f} name="bemerkung" rows={3} />
          <StepNav onBack={() => setStep(2)} onNext={() => flow.validateStep(3)} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Speichern')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Der Termin ist danach sofort für Kunden buchbar.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          next={[
            { label: tx('Termin buchen'), href: '#/intents/termin-buchen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
