/**
 * Termin buchen — 4-Schritt-Wizard für den Empfang.
 * Steps: 1) Freien Termin wählen → 2) Kundendaten → 3) Leistung & Hinweise → 4) Prüfen & speichern.
 * Reads: verfuegbare_termine, terminbuchung (Doppelbuchungs-Prüfung im Flow-Hook). Writes: terminbuchung (createTerminbuchung via Journey-Plan).
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
import { fieldText, fieldDate, fieldLookup } from '@/lib/journey';
import { useTerminBuchenFlow } from '@/lib/journey/flows/TerminBuchen';
import { tx } from '@/i18n';

export default function TerminBuchenPage() {
  const [step, setStep] = useState(1);
  const flow = useTerminBuchenFlow({
    steps: { termin: 1, vorname: 2, nachname: 2, telefon: 2, email: 2, leistung: 3, besondere_wuensche: 3 },
    items: {
      termin: r => {
        const iso = fieldDate(r, 'datum_uhrzeit');
        const stuhl = fieldLookup(r, 'stuhl')?.label;
        const bemerkung = fieldText(r, 'bemerkung');
        return {
          id: r.id,
          title: iso ? format(parseISO(iso), 'dd.MM.yyyy · HH:mm') : tx('Ohne Datum'),
          subtitle: [stuhl, bemerkung].filter(Boolean).join(' — ') || undefined,
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
        description: tx('Einen freien Termin für einen Kunden reservieren.'),
        needs: [tx('Name und Telefonnummer des Kunden'), tx('Gewünschte Leistung')],
      }}
    >
      <WizardStep label={tx('Termin')} description={tx('Wähle einen freien Termin aus den kommenden zwei Wochen.')}>
        <EntitySelectStep
          {...flow.picks.termin.select}
          {...flow.pick('termin')}
          avatar="none"
          create={false}
          emptyText={tx('Aktuell sind keine freien Termine vorhanden.')}
          searchPlaceholder={tx('Termin suchen …')}
        />
      </WizardStep>
      <WizardStep label={tx('Kunde')} description={tx('Wie heißt der Kunde und wie ist er erreichbar?')} needs={['termin']}>
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
      <WizardStep label={tx('Leistung')} description={tx('Was soll gemacht werden? Ergänze bei Bedarf Hinweise.')}>
        <div className="space-y-4">
          <Bound form={form} name="leistung" />
          <Bound form={form} name="besondere_wuensche" rows={3} />
          <StepNav
            onBack={() => setStep(2)}
            onNext={() => flow.validateStep(3)}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Der Termin wird für den Kunden reserviert und kann nicht erneut vergeben werden.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          next={[
            { label: tx('Freie Termine anlegen'), href: '#/intents/termine-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
