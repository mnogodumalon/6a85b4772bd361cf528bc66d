/**
 * Termin buchen — 4-Schritt-Wizard für den Empfang.
 * Steps: 1) Freien Termin wählen → 2) Kundendaten erfassen → 3) Leistung & Wünsche → 4) Prüfen & buchen.
 * Reads: verfuegbare_termine (noch nicht gebucht), terminbuchung. Writes: terminbuchung (via useTerminBuchenFlow).
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
import { dateFnsLocale, tx } from '@/i18n';

export default function TerminBuchenPage() {
  const [step, setStep] = useState(1);
  const flow = useTerminBuchenFlow({
    steps: { termin: 1, vorname: 2, nachname: 2, telefon: 2, email: 2, leistung: 3, besondere_wuensche: 3 },
    items: {
      termin: r => {
        const iso = fieldDate(r, 'datum_uhrzeit');
        const when = iso ? format(parseISO(iso), 'EEE, dd.MM.yyyy · HH:mm', { locale: dateFnsLocale() }) : tx('Ohne Zeitangabe');
        const stuhl = fieldLookup(r, 'stuhl')?.label;
        const note = fieldText(r, 'bemerkung');
        return { id: r.id, title: when, subtitle: [stuhl, note].filter(Boolean).join(' · ') || undefined };
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
        description: tx('Einem Kunden einen freien Termin mit der gewünschten Leistung geben.'),
        needs: [tx('Name und Telefonnummer des Kunden'), tx('Gewünschte Leistung')],
      }}
    >
      <WizardStep label={tx('Termin')} description={tx('Welcher freie Termin soll vergeben werden?')}>
        <EntitySelectStep
          {...flow.picks.termin.select}
          {...flow.pick('termin')}
          avatar="none"
          searchPlaceholder={tx('Termin oder Bemerkung suchen …')}
          emptyText={tx('Aktuell ist kein freier Termin vorhanden.')}
        />
      </WizardStep>
      <WizardStep label={tx('Kunde')} description={tx('Wie heißt der Kunde und wie erreichst du ihn?')} needs={['termin']}>
        <div className="space-y-4">
          <Bound form={f} name="vorname" />
          <Bound form={f} name="nachname" />
          <Bound form={f} name="telefon" />
          <Bound form={f} name="email" />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => flow.validateStep(2)}
            nextStepLabel={tx('Leistung')}
          />
        </div>
      </WizardStep>
      <WizardStep label={tx('Leistung')} description={tx('Was soll gemacht werden? Wünsche kannst du hier notieren.')}>
        <div className="space-y-4">
          <Bound form={f} name="leistung" />
          <Bound form={f} name="besondere_wuensche" rows={3} />
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
            confirmLabel={tx('Termin buchen')}
            whatHappensNext={tx('Der Termin ist danach für den Kunden reserviert und kann nicht erneut vergeben werden.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          title={tx('Termin gebucht')}
          whatHappensNext={tx('Der Kunde ist eingetragen. Weitere Termine kannst du jederzeit neu buchen.')}
          next={[
            { label: tx('Weiteren Termin buchen'), onClick: () => flow.reset() },
            { label: tx('Freie Termine anlegen'), href: '#/intents/freie-termine-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
