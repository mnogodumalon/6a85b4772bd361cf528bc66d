/**
 * useTerminBuchenFlow — the plumbing of the flow « Termin buchen », generated from the plan.
 *
 * Writes `terminbuchung`: asks `vorname`, `nachname`, `telefon`, `email`, `termin`, `leistung`, `besondere_wuensche`.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 3)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *
 *   const flow = useTerminBuchenFlow({
 *     steps: { termin: 1, vorname: 2, nachname: 2, telefon: 2, email: 2, leistung: 2, besondere_wuensche: 2 },
 *     items: { termin: r => ({ id: r.id, title: fieldText(r, 'bemerkung') }) },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     <EntitySelectStep {...flow.picks.termin.select} {...flow.pick('termin')} />
 *     <Bound form={flow.forms.terminbuchung} name="vorname" />
 *     <Bound form={flow.forms.terminbuchung} name="nachname" />
 *     <Bound form={flow.forms.terminbuchung} name="telefon" />
 *     <Bound form={flow.forms.terminbuchung} name="email" />
 *     <Bound form={flow.forms.terminbuchung} name="leistung" />
 *     <Bound form={flow.forms.terminbuchung} name="besondere_wuensche" />
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
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
export type TerminBuchenFieldKey = 'besondere_wuensche' | 'email' | 'leistung' | 'nachname' | 'telefon' | 'termin' | 'vorname';

export interface TerminBuchenForms {
  terminbuchung: StepForm<'terminbuchung'>;
}

// Alias so the option generics stay readable.
type Key = TerminBuchenFieldKey;

export interface TerminBuchenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    termin?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
}

const DEFAULT_STEPS: Record<string, number> = {"besondere_wuensche": 2, "email": 2, "leistung": 2, "nachname": 2, "telefon": 2, "termin": 1, "vorname": 2};
export const TERMINBUCHEN_REVIEW_STEP = 3;

function fromPick<T>(pick: { recordOf(id: string): JourneyRecord | undefined }, form: StepForm, field: string, read: (r: JourneyRecord) => T): T | undefined {
  const id = form.get(field);
  const rec = typeof id === 'string' && id ? pick.recordOf(id) : undefined;
  return rec ? read(rec) : undefined;
}
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

export function useTerminBuchenFlow(options: TerminBuchenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const terminbuchung = useStepForm('terminbuchung', {
    fields: ["vorname", "nachname", "telefon", "email", "termin", "leistung", "besondere_wuensche"],
    steps: only(steps, ["vorname", "nachname", "telefon", "email", "termin", "leistung", "besondere_wuensche"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["vorname", "nachname", "telefon", "email", "termin", "leistung", "besondere_wuensche"]),
    messages: only(options.messages as Record<string, string> | undefined, ["vorname", "nachname", "telefon", "email", "termin", "leistung", "besondere_wuensche"]),
  });
  const forms: TerminBuchenForms = { terminbuchung };
  const formList: StepForm[] = [terminbuchung];

  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
    termin: useRecordSearch(servicePort, 'verfuegbare_termine', withPickPolicy('termin', {
      searchFields: ["bemerkung"] as never,
      filter: "r.v_datum_uhrzeit >= now() and r.v_datum_uhrzeit <= now() + days(14)",
      where: (r: JourneyRecord) => (fieldDate(r, "datum_uhrzeit") ?? '') >= isoDaysFromToday(0) && (fieldDate(r, "datum_uhrzeit") ?? '') <= isoDaysFromToday(14),
      toItem: options.items?.termin as never,
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:termin-buchen:read:${entity}`);
  const picks = {
    termin: { ...searches.termin, select: { ...searches.termin.select, create: false as boolean, hint: hintFor('termin', 'verfuegbare_termine', {"conditions": [{"field": "datum_uhrzeit", "op": "gte", "value": {"rel": "today"}}, {"field": "datum_uhrzeit", "op": "lte", "value": {"days": 14, "rel": "today"}}], "mode": "all"} as PickWhere | null) } },
  };

  const plan: PlanStep[] = [
    {
      key: 'terminbuchung', entity: 'terminbuchung', form: terminbuchung, primary: true,    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'termin-buchen' });

  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: TerminBuchenFieldKey) => {
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
  const pickMany = (field: TerminBuchenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)));
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); };

  return {
    slug: 'termin-buchen' as const,
    draftKey: 'termin-buchen' as const,
    entity: 'terminbuchung' as const,
    form: terminbuchung,
    forms, formList, picks, submit, steps,    reviewStep: TERMINBUCHEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,
    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type TerminBuchenFlow = ReturnType<typeof useTerminBuchenFlow>;
