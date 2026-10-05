/**
 * Freie Termine anlegen — 4-Schritt-Wizard.
 * Steps: 1) Datum und Uhrzeit wählen → 2) Stuhl wählen → 3) Interne Bemerkung → 4) Prüfen & speichern.
 * Reads: —. Writes: verfuegbare_termine (über den Flow-Hook useTermineAnlegenFlow).
 * Composes: IntentWizardShell, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useTermineAnlegenFlow } from '@/lib/journey/flows/TermineAnlegen';
import { tx } from '@/i18n';

export default function TermineAnlegenPage() {
  const [step, setStep] = useState(1);
  const flow = useTermineAnlegenFlow({
    steps: { datum_uhrzeit: 1, stuhl: 2, bemerkung: 3 },
  });
  const f = flow.forms.verfuegbare_termine;

  return (
    <IntentWizardShell
      title={tx('Freie Termine anlegen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Lege einen freien Termin an, den Kunden buchen können.'),
        needs: [tx('Datum und Uhrzeit'), tx('Den Stuhl')],
      }}
    >
      <WizardStep label={tx('Datum und Uhrzeit')} description={tx('Wann soll der Termin stattfinden?')}>
        <div className="space-y-4">
          <Bound form={f} name="datum_uhrzeit" />
          <StepNav hideBack onNext={() => flow.validateStep(1)} nextStepLabel={tx('Stuhl')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Stuhl')} description={tx('An welchem Stuhl wird der Termin angeboten?')} needs={['datum_uhrzeit']}>
        <div className="space-y-4">
          <Bound form={f} name="stuhl" />
          <StepNav onBack={() => setStep(1)} onNext={() => flow.validateStep(2)} nextStepLabel={tx('Bemerkung')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Bemerkung')} description={tx('Optional: eine interne Notiz, die Kunden nicht sehen.')} needs={['datum_uhrzeit', 'stuhl']}>
        <div className="space-y-4">
          <Bound form={f} name="bemerkung" rows={3} />
          <StepNav onBack={() => setStep(2)} onNext={() => flow.validateStep(3)} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Der Termin erscheint sofort als frei buchbar.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          whatHappensNext={tx('Kunden können den Termin jetzt buchen.')}
          next={[
            { label: tx('Weiteren Termin anlegen'), onClick: flow.reset },
            { label: tx('Termin buchen'), href: '#/intents/termin-buchen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
