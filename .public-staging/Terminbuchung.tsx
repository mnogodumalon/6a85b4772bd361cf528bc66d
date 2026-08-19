import { useEffect, useState } from 'react';
import { format, startOfWeek, endOfWeek, addWeeks, parseISO, isWithinInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  createPublicRecord,
  prepareChallenge,
  recordRef,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import { IconCalendar, IconScissors, IconCheck, IconChevronLeft, IconUser, IconPhone, IconMail, IconClock, IconArmchair } from '@tabler/icons-react';

// ---- types ---------------------------------------------------------------

interface TerminRecord {
  id: string;
  datum_uhrzeit: string;
  stuhl: string; // 'stuhl_1' | 'stuhl_2'
}

interface BuchungRecord {
  id: string;
  termin_url: string | null;
}

// ---- helpers -------------------------------------------------------------

const STUHL_LABELS: Record<string, string> = {
  stuhl_1: 'Stuhl 1',
  stuhl_2: 'Stuhl 2',
};

const LEISTUNG_OPTS = [
  { key: 'haarschnitt', label: 'Haarschnitt', note: null },
  { key: 'faerben', label: 'Färben', note: tx('Hinweis: Färben dauert deutlich länger — bitte die richtige Leistung wählen.') },
  { key: 'haarschnitt_und_faerben', label: 'Haarschnitt & Färben', note: tx('Hinweis: Kombination dauert am längsten — bitte einplanen.') },
] as const;

type LeistungKey = 'haarschnitt' | 'faerben' | 'haarschnitt_und_faerben';

function extractTerminId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/records\/([^/]+)$/);
  return m ? m[1] : null;
}

function getWeekRange(weekOffset: 0 | 1): { start: Date; end: Date } {
  const now = new Date();
  const base = addWeeks(now, weekOffset);
  const start = startOfWeek(base, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(base, { weekStartsOn: 1 });     // Sunday
  return { start, end };
}

function groupByDate(termine: TerminRecord[]): Map<string, TerminRecord[]> {
  const map = new Map<string, TerminRecord[]>();
  for (const t of termine) {
    const day = t.datum_uhrzeit.slice(0, 10); // 'yyyy-MM-dd'
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(t);
  }
  // sort each day's slots by time
  for (const [, slots] of map) {
    slots.sort((a, b) => a.datum_uhrzeit.localeCompare(b.datum_uhrzeit));
  }
  return map;
}

// ---- step indicator -------------------------------------------------------

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: tx('Termin wählen') },
    { n: 2, label: tx('Deine Angaben') },
    { n: 3, label: tx('Bestätigung') },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className={[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-colors',
                step > s.n
                  ? 'bg-emerald-500 text-white'
                  : step === s.n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              ].join(' ')}
            >
              {step > s.n ? <IconCheck size={16} /> : s.n}
            </div>
            <span className={['text-xs mt-1 text-center', step === s.n ? 'text-foreground font-medium' : 'text-muted-foreground'].join(' ')}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={['flex-1 h-0.5 mx-2 mb-5 transition-colors', step > s.n + 0 ? 'bg-emerald-500' : 'bg-muted'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---- slot tile ------------------------------------------------------------

function SlotTile({
  termin,
  onSelect,
}: {
  termin: TerminRecord;
  onSelect: () => void;
}) {
  const time = termin.datum_uhrzeit.slice(11, 16); // 'HH:MM'
  const stuhlLabel = STUHL_LABELS[termin.stuhl] ?? termin.stuhl;
  return (
    <button
      onClick={onSelect}
      className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-3 hover:border-primary hover:bg-primary/5 transition-colors text-left w-full group"
    >
      <span className="flex items-center gap-1.5 font-semibold text-sm text-foreground">
        <IconClock size={14} className="shrink-0 text-primary" />
        {time} {tx('Uhr')}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <IconArmchair size={14} className="shrink-0" />
        {stuhlLabel}
      </span>
    </button>
  );
}

// ---- main component -------------------------------------------------------

export default function Terminbuchung() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  // data
  const [termine, setTermine] = useState<TerminRecord[]>([]);
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());
  const [loadingData, setLoadingData] = useState(false);

  // flow state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTermin, setSelectedTermin] = useState<TerminRecord | null>(null);

  // form state — all hooks before any early return
  const [leistung, setLeistung] = useState<LeistungKey | ''>('');
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [telefon, setTelefon] = useState('');
  const [email, setEmail] = useState('');
  const [besondereWuensche, setBesondereWuensche] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // load config
  useEffect(() => {
    loadPublicPagesConfig('terminbuchung')
      .then(c => {
        setCfg(c);
        setPage(c?.pages['terminbuchung'] ?? null);
        setLoadingCfg(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoadingCfg(false);
      });
  }, []);

  // load slots + bookings once config is ready
  useEffect(() => {
    if (!cfg || !page) return;
    setLoadingData(true);

    const terminEp = page.endpoints?.find(e => e.op === 'list' && e.entity === 'verfuegbare_termine');
    const buchungEp = page.endpoints?.find(e => e.op === 'list' && e.entity === 'terminbuchung');
    if (!terminEp || !buchungEp) {
      setLoadingData(false);
      return;
    }

    Promise.all([
      listPublicRecords(cfg, page, { appId: terminEp.app_id }),
      listPublicRecords(cfg, page, { appId: buchungEp.app_id }),
    ]).then(([terminRes, buchungRes]) => {
      // termine
      const rawTermine: TerminRecord[] = Object.values(terminRes).map(r => ({
        id: r.id,
        datum_uhrzeit: (r.fields.datum_uhrzeit as string) ?? '',
        stuhl: (r.fields.stuhl as string) ?? '',
      }));

      // booked IDs (anti-join)
      const booked = new Set<string>();
      for (const r of Object.values(buchungRes)) {
        const url = r.fields.termin as string | null | undefined;
        const tid = extractTerminId(url ?? null);
        if (tid) booked.add(tid);
      }

      // filter: this week (Mon–Sun) + next week, free only
      const thisWeek = getWeekRange(0);
      const nextWeek = getWeekRange(1);

      const filtered = rawTermine.filter(t => {
        if (!t.datum_uhrzeit) return false;
        if (booked.has(t.id)) return false;
        const d = parseISO(t.datum_uhrzeit);
        return (
          isWithinInterval(d, thisWeek) ||
          isWithinInterval(d, nextWeek)
        );
      });

      filtered.sort((a, b) => a.datum_uhrzeit.localeCompare(b.datum_uhrzeit));

      setTermine(filtered);
      setBookedIds(booked);
      setLoadingData(false);
    }).catch(() => setLoadingData(false));
  }, [cfg, page]);

  // warm up challenge on first interaction
  const handleFirstInteraction = () => {
    if (!cfg || !page) return;
    const ep = page.endpoints?.find(e => e.op === 'create');
    if (!ep) return;
    prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
  };

  if (loadingCfg) {
    return <PublicShell loading />;
  }
  if (unavailable || !cfg || !page) {
    return <PublicShell unavailable />;
  }

  // ---- Step 1: pick a slot ------------------------------------------------

  const grouped = groupByDate(termine);
  const sortedDays = Array.from(grouped.keys()).sort();

  const handleSelectTermin = (t: TerminRecord) => {
    setSelectedTermin(t);
    setStep(2);
    handleFirstInteraction();
  };

  // ---- Step 2: contact form -----------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTermin || !leistung) return;

    const ep = page.endpoints?.find(e2 => e2.op === 'create' && e2.entity === 'terminbuchung');
    if (!ep) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await createPublicRecord(cfg, page, {
        vorname,
        nachname,
        telefon,
        email: email || undefined,
        leistung,
        besondere_wuensche: besondereWuensche || undefined,
        termin: recordRef(cfg, page, '6a85b4674f059d5c7d13e874', selectedTermin.id),
      });
      setStep(3);
    } catch {
      setSubmitError(tx('Beim Absenden ist ein Fehler aufgetreten. Bitte versuche es erneut.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render --------------------------------------------------------------

  return (
    <PublicShell title={page.title ?? tx('Termin buchen')} description={page.description} wide>
      <StepIndicator step={step} />

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div>
          {loadingData && (
            <div className="flex justify-center py-16 text-muted-foreground text-sm">
              {tx('Lade verfügbare Termine …')}
            </div>
          )}
          {!loadingData && sortedDays.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <IconCalendar size={48} className="text-muted-foreground" />
              <p className="text-muted-foreground">
                {tx('Aktuell sind keine freien Termine in dieser und nächster Woche verfügbar.')}
              </p>
              <p className="text-sm text-muted-foreground">
                {tx('Bitte ruf uns an oder schau später nochmal vorbei.')}
              </p>
            </div>
          )}
          {!loadingData && sortedDays.length > 0 && (
            <div className="flex flex-col gap-6">
              {sortedDays.map(day => {
                const slots = grouped.get(day)!;
                const parsed = parseISO(day);
                const weekday = format(parsed, 'EEEE', { locale: de });
                const dateStr = format(parsed, 'd. MMMM', { locale: de });
                return (
                  <div key={day}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <IconCalendar size={14} className="shrink-0" />
                      {weekday}, {dateStr}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {slots.map(t => (
                        <SlotTile key={t.id} termin={t} onSelect={() => handleSelectTermin(t)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && selectedTermin && (
        <div>
          {/* selected slot summary */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-6 flex items-start gap-3">
            <IconCalendar size={20} className="shrink-0 text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-sm">
                {format(parseISO(selectedTermin.datum_uhrzeit), "EEEE, d. MMMM 'um' HH:mm 'Uhr'", { locale: de })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {STUHL_LABELS[selectedTermin.stuhl] ?? selectedTermin.stuhl}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* leistung */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold mb-1">
                {tx('Gewünschte Leistung')} <span className="text-destructive">*</span>
              </legend>
              {LEISTUNG_OPTS.map(opt => (
                <label
                  key={opt.key}
                  className={[
                    'flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors',
                    leistung === opt.key
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="leistung"
                      value={opt.key}
                      checked={leistung === opt.key}
                      onChange={() => setLeistung(opt.key)}
                      required
                      className="accent-primary"
                    />
                    <span className="font-medium text-sm">{opt.label}</span>
                  </span>
                  {opt.note && leistung === opt.key && (
                    <span className="text-xs text-amber-600 pl-5">{opt.note}</span>
                  )}
                </label>
              ))}
            </fieldset>

            {/* name row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <IconUser size={14} className="shrink-0 text-muted-foreground" />
                  {tx('Vorname')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={vorname}
                  onChange={e => setVorname(e.target.value)}
                  required
                  placeholder={tx('z. B. Maria')}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  {tx('Nachname')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={nachname}
                  onChange={e => setNachname(e.target.value)}
                  required
                  placeholder={tx('z. B. Müller')}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* telefon */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <IconPhone size={14} className="shrink-0 text-muted-foreground" />
                {tx('Telefonnummer')} <span className="text-destructive">*</span>
              </label>
              <input
                type="tel"
                value={telefon}
                onChange={e => setTelefon(e.target.value)}
                required
                placeholder={tx('z. B. 0151 12345678')}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <IconMail size={14} className="shrink-0 text-muted-foreground" />
                {tx('E-Mail-Adresse')}
                <span className="text-xs text-muted-foreground font-normal">({tx('optional')})</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={tx('z. B. maria@beispiel.de')}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* besondere wünsche */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {tx('Besondere Wünsche oder Hinweise')}
                <span className="text-xs text-muted-foreground font-normal ml-1">({tx('optional')})</span>
              </label>
              <textarea
                value={besondereWuensche}
                onChange={e => setBesondereWuensche(e.target.value)}
                rows={3}
                placeholder={tx('z. B. Allergie gegen bestimmte Produkte, gewünschter Stil …')}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>

            {submitError && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
              >
                <IconChevronLeft size={16} className="shrink-0" />
                {tx('Zurück')}
              </button>
              <button
                type="submit"
                disabled={submitting || !leistung}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <IconScissors size={16} className="shrink-0" />
                {submitting ? tx('Wird gesendet …') : tx('Buchung abschicken')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Step 3 ── */}
      {step === 3 && selectedTermin && (
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <IconCheck size={32} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-1">{tx('Buchung bestätigt!')}</h2>
            <p className="text-muted-foreground text-sm">
              {tx('Wir freuen uns auf deinen Besuch.')}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 w-full text-left flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <IconCalendar size={18} className="shrink-0 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{tx('Termin')}</p>
                <p className="font-semibold text-sm">
                  {format(parseISO(selectedTermin.datum_uhrzeit), "EEEE, d. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <IconArmchair size={18} className="shrink-0 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{tx('Stuhl')}</p>
                <p className="font-semibold text-sm">
                  {STUHL_LABELS[selectedTermin.stuhl] ?? selectedTermin.stuhl}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <IconScissors size={18} className="shrink-0 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{tx('Leistung')}</p>
                <p className="font-semibold text-sm">
                  {LEISTUNG_OPTS.find(o => o.key === leistung)?.label ?? leistung}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <IconUser size={18} className="shrink-0 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{tx('Name')}</p>
                <p className="font-semibold text-sm">{vorname} {nachname}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {tx('Bei Fragen oder für Änderungen ruf uns bitte an.')}
          </p>
        </div>
      )}
    </PublicShell>
  );
}
