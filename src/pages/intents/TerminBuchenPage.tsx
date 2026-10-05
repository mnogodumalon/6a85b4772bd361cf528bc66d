/**
 * Termin buchen — 5-Schritt-Wizard für die telefonische oder persönliche Terminaufnahme.
 * Steps: 1) Freien Termin wählen → 2) Kundendaten → 3) Leistung → 4) Besondere Wünsche → 5) Prüfen & speichern.
 * Reads: verfuegbare_termine (Auswahl), terminbuchung (Prüfung auf bereits vergebene Termine). Writes: terminbuchung (via useTerminBuchenFlow).
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
    steps: {
      termin: 1,
      vorname: 2, nachname: 2, telefon: 2, email: 2,
      leistung: 3,
      besondere_wuensche: 4,
    },
    items: {
      termin: r => {
        const iso = fieldDate(r, 'datum_uhrzeit');
        const stuhl = fieldLookup(r, 'stuhl');
        return {
          id: r.id,
          title: iso ? format(parseISO(iso), 'dd.MM.yyyy · HH:mm') : tx('Ohne Datum'),
          subtitle: [stuhl?.label, fieldText(r, 'bemerkung')].filter(Boolean).join(' — ') || undefined,
        };
      },
    },
  });
  const form = flow.forms.terminbuchung;

  return (
    <IntentWizardShell
      title={tx('Termin buchen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Freien Termin wählen, Kundendaten und Leistung erfassen.'),
        needs: [tx('Name und Telefonnummer der Kundschaft'), tx('Gewünschte Leistung')],
      }}
    >
      <WizardStep label={tx('Termin')} description={tx('Wähle einen freien Termin der nächsten zwei Wochen.')}>
        <EntitySelectStep
          {...flow.picks.termin.select}
          {...flow.pick('termin')}
          avatar="none"
          searchPlaceholder={tx('Termin suchen …')}
          emptyText={tx('Aktuell ist kein freier Termin verfügbar.')}
        />
      </WizardStep>

      <WizardStep label={tx('Kundendaten')} description={tx('Wie heißt die Kundschaft und wie ist sie erreichbar?')} needs={['termin']}>
        <div className="space-y-4">
          <Bound form={form} name="vorname" />
          <Bound form={form} name="nachname" />
          <Bound form={form} name="telefon" />
          <Bound form={form} name="email" />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => flow.validateStep(2)}
            nextStepLabel={tx('Leistung')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Leistung')} description={tx('Was soll gemacht werden?')} needs={['termin']}>
        <div className="space-y-4">
          <Bound form={form} name="leistung" />
          <StepNav
            onBack={() => setStep(2)}
            onNext={() => flow.validateStep(3)}
            nextStepLabel={tx('Besondere Wünsche')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Wünsche')} description={tx('Gibt es besondere Wünsche oder Hinweise?')} needs={['termin']}>
        <div className="space-y-4">
          <Bound form={form} name="besondere_wuensche" rows={4} hint={tx('Freiwillig')} />
          <StepNav
            onBack={() => setStep(3)}
            onNext={() => flow.validateStep(4)}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Der Termin ist danach vergeben und wird nicht mehr angeboten.')}
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
