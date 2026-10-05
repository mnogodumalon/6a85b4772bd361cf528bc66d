/**
 * useTermineAnlegenFlow — the plumbing of the flow « Freie Termine anlegen », generated from the plan.
 *
 * Writes `verfuegbare_termine`: asks `datum_uhrzeit`, `stuhl`, `bemerkung`.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 2)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *
 *   const flow = useTermineAnlegenFlow({
 *     steps: { datum_uhrzeit: 1, stuhl: 1, bemerkung: 1 },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     <Bound form={flow.forms.verfuegbare_termine} name="datum_uhrzeit" />
 *     <Bound form={flow.forms.verfuegbare_termine} name="stuhl" />
 *     <Bound form={flow.forms.verfuegbare_termine} name="bemerkung" />
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} />}
 *     {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit} />}
 *   </IntentWizardShell>
 */
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldLookups, fieldNumber, fieldDate, fieldRef,
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion,
  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
export type TermineAnlegenFieldKey = 'bemerkung' | 'datum_uhrzeit' | 'stuhl';

export interface TermineAnlegenForms {
  verfuegbare_termine: StepForm<'verfuegbare_termine'>;
}

// Alias so the option generics stay readable.
type Key = TermineAnlegenFieldKey;

export interface TermineAnlegenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
}

const DEFAULT_STEPS: Record<string, number> = {"bemerkung": 1, "datum_uhrzeit": 1, "stuhl": 1};
export const TERMINEANLEGEN_REVIEW_STEP = 2;

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Returns T, not Partial<T>: a Record's index signature is already "maybe
// absent", and Partial<Record<string, string>> does not assign to the
// Record<string, string> useStepForm wants (tsc, live 23.09.2026 — eight
// errors, one per hook, caught only in the sandbox build).
function only<T extends Record<string, unknown>>(obj: T | undefined, keys: string[]): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out as T;
}

function hasValues(form: StepForm): boolean {
  return form.keys.some(k => !isEmptyValue(form.values[k]));
}

export function useTermineAnlegenFlow(options: TermineAnlegenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const verfuegbare_termine = useStepForm('verfuegbare_termine', {
    fields: ["datum_uhrzeit", "stuhl", "bemerkung"],
    steps: only(steps, ["datum_uhrzeit", "stuhl", "bemerkung"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["datum_uhrzeit", "stuhl", "bemerkung"]),
    messages: only(options.messages as Record<string, string> | undefined, ["datum_uhrzeit", "stuhl", "bemerkung"]),
  });
  const forms: TermineAnlegenForms = { verfuegbare_termine };
  const formList: StepForm[] = [verfuegbare_termine];

  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  const picks = {
  };

  const plan: PlanStep[] = [
    {
      key: 'verfuegbare_termine', entity: 'verfuegbare_termine', form: verfuegbare_termine, primary: true,    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'termine-anlegen' });

  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: TermineAnlegenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return {
      selectedId: (typeof owner.get(field) === 'string' ? (owner.get(field) as string) : null) || null,
      // `field as never` collapsed the conditional SetArgs<E, never> to never and
      // no argument was assignable any more (tsc, live 23.09.2026); widen `set`
      // itself instead — the label stays a required third argument.
      onSelect: (id: string) => (owner.set as (k: string, v: unknown, l?: string) => void)(field, id, search?.labelOf(id)),
    };
  };
  /** Props for a multi-record pick step: {...flow.picks.x.select} {...flow.pickMany('x')} */
  const pickMany = (field: TermineAnlegenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)));
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); };

  return {
    slug: 'termine-anlegen' as const,
    draftKey: 'termine-anlegen' as const,
    entity: 'verfuegbare_termine' as const,
    form: verfuegbare_termine,
    forms, formList, picks, submit, steps,    reviewStep: TERMINEANLEGEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,
  };
}

export type TermineAnlegenFlow = ReturnType<typeof useTermineAnlegenFlow>;
