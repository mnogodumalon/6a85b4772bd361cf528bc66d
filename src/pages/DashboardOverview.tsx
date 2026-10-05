import { useMemo, useRef, useState } from 'react';
import { addMinutes, addWeeks, endOfWeek, format, parseISO, startOfDay, startOfWeek } from 'date-fns';
import { IconAlertTriangle, IconCalendarPlus } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import type { Terminbuchung, VerfuegbareTermine } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { tx, dateFnsLocale } from '@/i18n';
import { gruss, namen, undoToast, useClock } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { CalendarWidget, type CalendarEvent } from '@/components/widgets/CalendarWidget';
import { ChartWidget, type ChartRow } from '@/components/widgets/ChartWidget';

type SlotFilter = 'all' | 'free' | 'booked';

const SLOT_FMT = "yyyy-MM-dd'T'HH:mm";

// Dauer in Minuten je Leistung — Färben dauert deutlich länger.
function dauer(leistungKey: string | undefined): number {
  if (leistungKey === 'faerben') return 120;
  if (leistungKey === 'haarschnitt_und_faerben') return 150;
  if (leistungKey === 'haarschnitt') return 45;
  return 30;
}

function bookingName(b: Terminbuchung): string {
  return [b.fields.vorname, b.fields.nachname].filter(Boolean).join(' ') || '—';
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    verfuegbareTermine, terminbuchung, verfuegbareTermineMap,
    setVerfuegbareTermine, setTerminbuchung, fetchAll,
  } = data;
  const clock = useClock();
  const [filter, setFilter] = useState<SlotFilter>('all');
  const crudRef = useRef<ReturnType<typeof useEntityCrud> | null>(null);

  // Buchungen je Termin — Basis für "frei" und Doppelbuchungs-Erkennung.
  const bookingsBySlot = useMemo(() => {
    const m = new Map<string, Terminbuchung[]>();
    for (const b of terminbuchung) {
      const id = extractRecordId(b.fields.termin);
      if (!id) continue;
      m.set(id, [...(m.get(id) ?? []), b]);
    }
    return m;
  }, [terminbuchung]);

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'verfuegbareTermine') return undefined;
      const slot = top.record as VerfuegbareTermine;
      if ((bookingsBySlot.get(slot.record_id) ?? []).length > 0) return undefined;
      return {
        label: tx('Termin buchen'),
        onClick: () => {
          const c = crudRef.current;
          if (!c) return;
          c.overlay.close();
          c.terminbuchung.openCreate({ termin: slot.record_id });
        },
      };
    },
  });
  crudRef.current = crud;

  const windowStart = clock;
  const windowEnd = endOfWeek(addWeeks(clock, 1), { weekStartsOn: 1 });
  const todayStart = startOfDay(clock);
  const localeOpt = { locale: dateFnsLocale() };
  const when = (iso: string | undefined) => (iso ? format(parseISO(iso), 'EEE d.M. HH:mm', localeOpt) : '—');

  const freeSlots = useMemo(() => verfuegbareTermine
    .filter(s => s.fields.datum_uhrzeit && !bookingsBySlot.has(s.record_id))
    .filter(s => {
      const d = parseISO(s.fields.datum_uhrzeit as string);
      return d >= windowStart && d <= windowEnd;
    })
    .sort((a, b) => (a.fields.datum_uhrzeit ?? '').localeCompare(b.fields.datum_uhrzeit ?? '')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [verfuegbareTermine, bookingsBySlot, format(clock, 'yyyy-MM-dd HH:mm')]);

  // Anstehende Buchungen mit ihrem Termin, chronologisch.
  const upcoming = useMemo(() => terminbuchung
    .map(b => {
      const slot = verfuegbareTermineMap.get(extractRecordId(b.fields.termin) ?? '');
      return { b, slot };
    })
    .filter((x): x is { b: Terminbuchung; slot: VerfuegbareTermine } =>
      !!x.slot?.fields.datum_uhrzeit && parseISO(x.slot.fields.datum_uhrzeit) >= todayStart)
    .sort((x, y) => (x.slot.fields.datum_uhrzeit ?? '').localeCompare(y.slot.fields.datum_uhrzeit ?? '')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [terminbuchung, verfuegbareTermineMap, format(todayStart, 'yyyy-MM-dd')]);

  const bookedInWindow = upcoming.filter(x => parseISO(x.slot.fields.datum_uhrzeit as string) <= windowEnd);
  const faerbenCount = bookedInWindow.filter(x => x.b.fields.leistung?.key !== 'haarschnitt').length;

  // Doppelbuchungen: mehr als eine Buchung auf demselben Termin.
  const doubles = useMemo(() => {
    const out: { slot: VerfuegbareTermine; bookings: Terminbuchung[] }[] = [];
    bookingsBySlot.forEach((list, id) => {
      const slot = verfuegbareTermineMap.get(id);
      if (slot && list.length > 1) {
        out.push({ slot, bookings: [...list].sort((a, b) => (a.createdat ?? '').localeCompare(b.createdat ?? '')) });
      }
    });
    return out;
  }, [bookingsBySlot, verfuegbareTermineMap]);

  // Kalender-Ereignisse: ein Termin = ein Ereignis; Dauer folgt der Leistung.
  const events: CalendarEvent[] = useMemo(() => {
    const out: CalendarEvent[] = [];
    for (const s of verfuegbareTermine) {
      const iso = s.fields.datum_uhrzeit;
      if (!iso) continue;
      const start = parseISO(iso);
      if (filter !== 'all' && (start < windowStart || start > windowEnd)) continue;
      const list = bookingsBySlot.get(s.record_id) ?? [];
      if (filter === 'free' && list.length > 0) continue;
      if (filter === 'booked' && list.length === 0) continue;
      const stuhl = s.fields.stuhl?.label ?? '';
      const first = list[0];
      const minutes = dauer(first?.fields.leistung?.key);
      out.push({
        id: `slot:${s.record_id}`,
        start: format(start, SLOT_FMT),
        end: format(addMinutes(start, minutes), SLOT_FMT),
        title: first ? (list.length > 1 ? `⚠ ${bookingName(first)} +${list.length - 1}` : bookingName(first)) : tx('Frei'),
        subtitle: first ? [first.fields.leistung?.label, stuhl].filter(Boolean).join(' · ') : stuhl,
        tone: list.length > 1 ? 'destructive' : !first ? 'success'
          : first.fields.leistung?.key === 'haarschnitt' ? 'primary' : 'warning',
      });
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verfuegbareTermine, bookingsBySlot, filter, format(clock, 'yyyy-MM-dd HH:mm')]);

  const chartRows: ChartRow<Terminbuchung>[] = useMemo(
    () => terminbuchung.map(b => ({ id: `terminbuchung:${b.record_id}`, data: b })),
    [terminbuchung],
  );

  // Eine Schreibstelle für "Buchung stornieren" (Termin wird wieder frei) — optimistisch + Undo.
  const cancelBooking = (b: Terminbuchung) => {
    const snapshot = b;
    setTerminbuchung(prev => prev.filter(x => x.record_id !== b.record_id));
    LivingAppsService.deleteTerminbuchungEntry(b.record_id).catch(() => { void fetchAll(); });
    undoToast(tx`${bookingName(b)} storniert — Termin ist wieder frei`, async () => {
      setTerminbuchung(prev => [...prev, snapshot]);
      try {
        await LivingAppsService.createTerminbuchungEntry(snapshot.fields);
      } finally {
        void fetchAll();
      }
    });
  };

  // Verschieben eines FREIEN Termins; Regel: pro Stuhl nur ein Termin zur selben Zeit.
  const onEventDrop = (eventId: string, newStart: string): string | void => {
    const id = eventId.split(':')[1];
    const slot = verfuegbareTermineMap.get(id);
    if (!slot) return;
    if ((bookingsBySlot.get(id) ?? []).length > 0) {
      return tx('Gebuchte Termine bitte über die Buchung ändern, nicht per Verschieben.');
    }
    const next = newStart.slice(0, 16);
    const clash = verfuegbareTermine.some(s => s.record_id !== id
      && s.fields.stuhl?.key === slot.fields.stuhl?.key
      && (s.fields.datum_uhrzeit ?? '').slice(0, 16) === next);
    if (clash) return tx('Zu dieser Zeit gibt es an diesem Stuhl schon einen Termin.');
    const prevStart = slot.fields.datum_uhrzeit;
    setVerfuegbareTermine(prev => prev.map(s => s.record_id === id
      ? { ...s, fields: { ...s.fields, datum_uhrzeit: next } } : s));
    LivingAppsService.updateVerfuegbareTermineEntry(id, { datum_uhrzeit: next })
      .catch(() => { void fetchAll(); });
    undoToast(tx`Termin auf ${when(next)} verschoben`, () => {
      setVerfuegbareTermine(prev => prev.map(s => s.record_id === id
        ? { ...s, fields: { ...s.fields, datum_uhrzeit: prevStart } } : s));
      LivingAppsService.updateVerfuegbareTermineEntry(id, { datum_uhrzeit: prevStart })
        .catch(() => { void fetchAll(); });
    });
  };

  const nextBooking = upcoming[0];
  const nextFree = freeSlots[0];

  const contextLine = nextBooking
    ? tx`Als Nächstes kommt ${bookingName(nextBooking.b)} (${nextBooking.b.fields.leistung?.label ?? '—'}) am ${when(nextBooking.slot.fields.datum_uhrzeit)}. In den nächsten zwei Wochen sind noch ${freeSlots.length} Termine frei.`
    : nextFree
      ? tx`Noch keine Buchungen — der nächste freie Termin ist ${when(nextFree.fields.datum_uhrzeit)} an ${nextFree.fields.stuhl?.label ?? '—'}.`
      : tx`Lege freie Termine für deine beiden Stühle an, damit Kunden online buchen können.`;

  const hasData = verfuegbareTermine.length > 0 || terminbuchung.length > 0;
  const firstDouble = doubles[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{tx('Terminplaner')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gruss(clock)} {contextLine}
          </p>
        </div>
        <Button onClick={() => crud.verfuegbareTermine.openCreate({})} className="shrink-0">
          <IconCalendarPlus size={16} className="shrink-0" />
          <span className="ml-2">{tx('Freien Termin anlegen')}</span>
        </Button>
      </div>

      <DashboardGrid
        variant="split"
        hero={firstDouble && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Spätere Buchung prüfen'),
              onClick: () => crud.terminbuchung.openDetail(firstDouble.bookings[firstDouble.bookings.length - 1]),
            }}
          >
            <b>{namen(firstDouble.bookings.map(b => bookingName(b)))}</b>{' '}
            {tx`haben denselben Termin gebucht (${when(firstDouble.slot.fields.datum_uhrzeit)}, ${firstDouble.slot.fields.stuhl?.label ?? '—'}) — einer muss umgebucht werden.`}
          </HeroBanner>
        )}
        kpis={hasData ? (
          <StatCardRow>
            <StatCard
              title={tx('Freie Termine')}
              value={freeSlots.length}
              description={nextFree
                ? tx`Nächster: ${when(nextFree.fields.datum_uhrzeit)}`
                : tx`Keine frei — neue Termine anlegen`}
              tone={freeSlots.length > 0 ? 'success' : 'warning'}
              onClick={() => setFilter(f => (f === 'free' ? 'all' : 'free'))}
              active={filter === 'free'}
            />
            <StatCard
              title={tx('Gebucht (2 Wochen)')}
              value={bookedInWindow.length}
              description={tx`${faerbenCount} davon mit Färben (länger)`}
              tone="primary"
              onClick={() => setFilter(f => (f === 'booked' ? 'all' : 'booked'))}
              active={filter === 'booked'}
            />
          </StatCardRow>
        ) : undefined}
        aside={
          <>
            <WorkList
              title={tx('Anstehende Buchungen')}
              items={upcoming.map(({ b, slot }) => ({
                id: b.record_id,
                title: bookingName(b),
                secondLine: (
                  <>
                    <span className={b.fields.leistung?.key === 'haarschnitt' ? 'font-medium' : 'font-medium text-amber-600'}>
                      {b.fields.leistung?.label ?? '—'}
                    </span>
                    <span className="text-muted-foreground">
                      {' · '}{when(slot.fields.datum_uhrzeit)}{' · '}{slot.fields.stuhl?.label ?? '—'}
                      {b.fields.besondere_wuensche ? ` · ${tx('Wunsch notiert')}` : ''}
                    </span>
                  </>
                ),
                action: { label: tx('Stornieren'), onClick: () => cancelBooking(b) },
              }))}
              max={6}
              onItemClick={id => {
                const rec = terminbuchung.find(b => b.record_id === id);
                if (rec) crud.terminbuchung.openDetail(rec);
              }}
              empty={{
                text: nextFree
                  ? tx`Keine Buchungen — nächster freier Termin: ${when(nextFree.fields.datum_uhrzeit)}`
                  : tx`Keine Buchungen und keine freien Termine.`,
                action: { label: tx('Freien Termin anlegen'), onClick: () => crud.verfuegbareTermine.openCreate({}) },
              }}
            />
            <ChartWidget<Terminbuchung>
              title={tx('Buchungen nach Leistung')}
              rows={chartRows}
              dimension={{ kind: 'category', accessor: r => r.data.fields.leistung, label: tx('Leistung') }}
            />
          </>
        }
        primary={
          <CalendarWidget
            events={events}
            defaultView="week"
            weekStartsOn={1}
            locale={dateFnsLocale()}
            dayStartHour={8}
            dayEndHour={20}
            dragSnapMinutes={15}
            onEventClick={ev => {
              const slot = verfuegbareTermineMap.get(ev.id.split(':')[1]);
              if (slot) crud.verfuegbareTermine.openDetail(slot);
            }}
            onEmptyClick={d => crud.verfuegbareTermine.openCreate({ datum_uhrzeit: format(d, SLOT_FMT) })}
            onEventDrop={onEventDrop}
          />
        }
      />
      {crud.surfaces}
    </div>
  );
}
