/**
 * Freie Termine anlegen — 4-Schritt-Wizard.
 * Steps: 1) Datum und Uhrzeit → 2) Stuhl wählen (Doppelbelegung wird geprüft) → 3) Bemerkung → 4) Prüfen & speichern.
 * Reads: verfuegbare_termine (Überschneidungs-Check). Writes: verfuegbare_termine (über useFreieTermineAnlegenFlow).
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
  const form = flow.forms.verfuegbare_termine;

  // Check before the write: no second slot for the same chair at the same time.
  const checkOverlap = async (): Promise<boolean | string> => {
    if (!flow.validateStep(2)) return false;
    const datum = String(form.get('datum_uhrzeit') ?? '').slice(0, 16);
    const stuhl = String(form.get('stuhl') ?? '');
    const existing = await flow.port.list('verfuegbare_termine', { limit: 1000 });
    const clash = existing.some(r =>
      (fieldDate(r, 'datum_uhrzeit') ?? '').slice(0, 16) === datum && fieldLookup(r, 'stuhl')?.key === stuhl);
    return clash ? tx('Für diesen Stuhl gibt es zu dieser Zeit bereits einen Termin.') : true;
  };

  return (
    <IntentWizardShell
      title={tx('Freie Termine anlegen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Erfasse neue freie Termine für einen Stuhl, damit Kunden sie buchen können.'),
        needs: [tx('Datum und Uhrzeit'), tx('Stuhl')],
      }}
    >
      <WizardStep label={tx('Zeitpunkt')} description={tx('Wann soll der Termin stattfinden?')}>
        <div className="space-y-4">
          <Bound form={form} name="datum_uhrzeit" />
          <StepNav hideBack onNext={() => flow.validateStep(1)} nextStepLabel={tx('Stuhl')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Stuhl')} description={tx('An welchem Stuhl wird der Termin angeboten?')} needs={['datum_uhrzeit']}>
        <div className="space-y-4">
          <Bound form={form} name="stuhl" />
          <StepNav onBack={() => setStep(1)} onNext={checkOverlap} nextStepLabel={tx('Bemerkung')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Bemerkung')} description={tx('Eine interne Notiz ist freiwillig.')}>
        <div className="space-y-4">
          <Bound form={form} name="bemerkung" rows={3} />
          <StepNav onBack={() => setStep(2)} onNext={() => flow.validateStep(3)} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
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
          whatHappensNext={tx('Der Termin steht jetzt zur Buchung bereit.')}
          next={[
            { label: tx('Weiteren Termin anlegen'), onClick: () => { flow.reset(); setStep(1); } },
            { label: tx('Termin für Kunden buchen'), href: '#/intents/termin-buchen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
