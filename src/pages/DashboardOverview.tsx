// Analyse: Termine (Verfügbare Termine) sind zeitgebunden und je Stuhl belegt → CalendarWidget (Woche, Stunden-Raster);
// ein ResourceTimeline wurde nicht gewählt, weil zwei Stühle als Chips nebeneinander im Wochenraster genügen.
// Komposition: Hero nur bei Doppelbuchung; variant="wide" + StatStrip; Band: freie Termine / neue Buchungen / Buchungen je Leistung.
// Mobil: Kalender schaltet selbst auf 3-Tage-Fenster, Listen stehen davor.
import { useMemo, useState } from 'react';
import { addDays, addMinutes, endOfDay, format, isSameDay, isWithinInterval, parseISO, startOfDay } from 'date-fns';
import { IconAlertTriangle, IconCalendarPlus, IconCut, IconUserPlus } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import type { VerfuegbareTermine, Terminbuchung } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { dateFnsLocale, tx } from '@/i18n';
import { gruss, namen, undoToast, useClock } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { CalendarWidget, type CalendarEvent } from '@/components/widgets/CalendarWidget';
import { ChartWidget, type ChartRow } from '@/components/widgets/ChartWidget';
import { Button } from '@/components/ui/button';

type Filter = 'all' | 'free' | 'booked';

// Dauer je Leistung in Minuten — Färben belegt den Stuhl länger.
const DAUER: Record<string, number> = { haarschnitt: 30, faerben: 90, haarschnitt_und_faerben: 120 };
const FREI_DAUER = 30;

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { verfuegbareTermine, terminbuchung, verfuegbareTermineMap, setVerfuegbareTermine, fetchAll } = data;
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>('all');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'verfuegbareTermine') return undefined;
      if (bookingBySlot.has(top.record.record_id)) return undefined;
      return {
        label: tx('Buchung erfassen'),
        onClick: () => crud.terminbuchung.openCreate({ termin: top.record.record_id }),
      };
    },
  });
  const enrichedTerminbuchung = crud.enriched.terminbuchung;

  // Slot-ID → Buchungen (mehr als eine = Doppelbuchung)
  const bookingsBySlot = useMemo(() => {
    const m = new Map<string, Terminbuchung[]>();
    terminbuchung.forEach(b => {
      const id = extractRecordId(b.fields.termin);
      if (!id) return;
      m.set(id, [...(m.get(id) ?? []), b]);
    });
    return m;
  }, [terminbuchung]);
  const bookingBySlot = useMemo(() => {
    const m = new Map<string, Terminbuchung>();
    bookingsBySlot.forEach((list, id) => m.set(id, list[0]));
    return m;
  }, [bookingsBySlot]);

  const durationOf = (slot: VerfuegbareTermine): number => {
    const b = bookingBySlot.get(slot.record_id);
    return b ? (DAUER[lookupKey(b.fields.leistung) ?? ''] ?? FREI_DAUER) : FREI_DAUER;
  };

  const guestName = (b: Terminbuchung) => [b.fields.vorname, b.fields.nachname].filter(Boolean).join(' ') || tx('Ohne Namen');

  const slots = useMemo(
    () => verfuegbareTermine
      .filter(s => !!s.fields.datum_uhrzeit)
      .sort((a, b) => a.fields.datum_uhrzeit!.localeCompare(b.fields.datum_uhrzeit!)),
    [verfuegbareTermine],
  );

  const todayStart = startOfDay(clock);
  const horizon = endOfDay(addDays(todayStart, 13));
  const inWindow = (s: VerfuegbareTermine) =>
    isWithinInterval(parseISO(s.fields.datum_uhrzeit!), { start: clock < todayStart ? clock : todayStart, end: horizon });

  const upcomingSlots = slots.filter(inWindow);
  const freeUpcoming = upcomingSlots.filter(s => !bookingsBySlot.has(s.record_id) && parseISO(s.fields.datum_uhrzeit!) >= clock);
  const bookedUpcoming = upcomingSlots.filter(s => bookingsBySlot.has(s.record_id));
  const doubles = slots.filter(s => (bookingsBySlot.get(s.record_id)?.length ?? 0) > 1);

  const newBookings = useMemo(
    () => [...terminbuchung].sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? '')),
    [terminbuchung],
  );
  const newThisWeek = newBookings.filter(b => b.createdat && parseISO(b.createdat) >= addDays(clock, -7));

  const todaysBookings = slots
    .filter(s => isSameDay(parseISO(s.fields.datum_uhrzeit!), clock) && bookingBySlot.has(s.record_id))
    .map(s => ({ slot: s, b: bookingBySlot.get(s.record_id)! }));

  // Kontextzeile — nennt in jedem Zweig Personen/Termine
  const nextFree = freeUpcoming[0];
  const context = (() => {
    const todayNames = namen(todaysBookings.map(x => x.b.fields.vorname ?? guestName(x.b)));
    if (todaysBookings.length > 0) {
      return nextFree
        ? tx`Heute kommen ${todayNames} — der nächste freie Termin ist ${format(parseISO(nextFree.fields.datum_uhrzeit!), 'EEE HH:mm', { locale: dateFnsLocale() })}.`
        : tx`Heute kommen ${todayNames} — in den nächsten zwei Wochen ist nichts mehr frei.`;
    }
    if (newBookings.length > 0) {
      const last = newBookings[0];
      return nextFree
        ? tx`Heute keine Kunden angemeldet — zuletzt hat ${guestName(last)} gebucht, nächster freier Termin ${format(parseISO(nextFree.fields.datum_uhrzeit!), 'EEE HH:mm', { locale: dateFnsLocale() })}.`
        : tx`Heute keine Kunden angemeldet — zuletzt hat ${guestName(last)} gebucht, es sind keine freien Termine mehr offen.`;
    }
    return nextFree
      ? tx`Noch keine Buchung — online sichtbar ist ab ${format(parseISO(nextFree.fields.datum_uhrzeit!), 'EEE HH:mm', { locale: dateFnsLocale() })} ein freier Termin.`
      : tx`Lege freie Termine für Stuhl 1 und Stuhl 2 an, damit Kunden online buchen können.`;
  })();

  // Regel: auf einem Stuhl darf sich nichts überschneiden (Färben dauert länger)
  const ruleViolation = (slotId: string, newStart: string): string | null => {
    const me = verfuegbareTermineMap.get(slotId);
    if (!me) return null;
    const start = parseISO(newStart);
    const end = addMinutes(start, durationOf(me));
    const chair = lookupKey(me.fields.stuhl);
    for (const o of slots) {
      if (o.record_id === slotId || lookupKey(o.fields.stuhl) !== chair) continue;
      const os = parseISO(o.fields.datum_uhrzeit!);
      const oe = addMinutes(os, durationOf(o));
      if (start < oe && os < end) {
        return tx`Auf diesem Stuhl ist um ${format(os, 'HH:mm')} Uhr schon ein Termin — die Zeiten würden sich überschneiden.`;
      }
    }
    return null;
  };

  const reschedule = (eventId: string, newStart: string): string | void => {
    const id = eventId.split(':')[1];
    const slot = id ? verfuegbareTermineMap.get(id) : undefined;
    if (!id || !slot) return;
    const violation = ruleViolation(id, newStart);
    if (violation) return violation;
    const oldStart = slot.fields.datum_uhrzeit!;
    const apply = (value: string) =>
      setVerfuegbareTermine(prev => prev.map(s => s.record_id === id ? { ...s, fields: { ...s.fields, datum_uhrzeit: value } } : s));
    apply(newStart);
    LivingAppsService.updateVerfuegbareTermineEntry(id, { datum_uhrzeit: newStart })
      .then(() => undoToast(tx`Termin verschoben`, () => {
        apply(oldStart);
        LivingAppsService.updateVerfuegbareTermineEntry(id, { datum_uhrzeit: oldStart }).catch(() => fetchAll());
      }))
      .catch(() => fetchAll());
  };

  const stuhlLabel = (s: VerfuegbareTermine) => s.fields.stuhl?.label ?? tx('Stuhl');

  const events: CalendarEvent[] = slots
    .filter(s => {
      const booked = bookingsBySlot.has(s.record_id);
      return filter === 'all' || (filter === 'free' ? !booked : booked);
    })
    .map(s => {
      const list = bookingsBySlot.get(s.record_id) ?? [];
      const b = list[0];
      const start = s.fields.datum_uhrzeit!;
      return {
        id: `termin:${s.record_id}`,
        start,
        end: format(addMinutes(parseISO(start), durationOf(s)), "yyyy-MM-dd'T'HH:mm"),
        title: b ? `${stuhlLabel(s)} · ${guestName(b)}` : `${stuhlLabel(s)} · ${tx('frei')}`,
        subtitle: b ? b.fields.leistung?.label : undefined,
        tone: list.length > 1 ? 'destructive' : b ? 'primary' : 'success',
      } satisfies CalendarEvent;
    });

  const openSlot = (id: string) => {
    const rec = verfuegbareTermineMap.get(id);
    if (rec) crud.verfuegbareTermine.openDetail(rec);
  };

  const slotLabel = (s: VerfuegbareTermine) =>
    `${format(parseISO(s.fields.datum_uhrzeit!), 'EEE dd.MM. HH:mm', { locale: dateFnsLocale() })} · ${stuhlLabel(s)}`;

  const rows = useMemo<ChartRow<Terminbuchung>[]>(
    () => terminbuchung.map(b => ({ id: `terminbuchung:${b.record_id}`, data: b })),
    [terminbuchung],
  );

  const doubleBooked = doubles[0];
  const doubleLater = doubleBooked ? (bookingsBySlot.get(doubleBooked.record_id) ?? [])[1] : undefined;

  const empty = slots.length === 0 && terminbuchung.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{context}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => crud.terminbuchung.openCreate({})}>
            <IconUserPlus size={16} className="shrink-0" />
            <span>{tx('Buchung erfassen')}</span>
          </Button>
          <Button onClick={() => crud.verfuegbareTermine.openCreate({})}>
            <IconCalendarPlus size={16} className="shrink-0" />
            <span>{tx('Freien Termin anlegen')}</span>
          </Button>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-3 rounded-[27px] bg-card px-6 py-12 text-center shadow-lg">
          <IconCut size={48} className="text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">
            {tx('Richte deinen Salon ein: Lege freie Termine für Stuhl 1 und Stuhl 2 an, dann können Kunden online einen davon buchen.')}
          </p>
          <Button onClick={() => crud.verfuegbareTermine.openCreate({})}>{tx('Ersten freien Termin anlegen')}</Button>
        </div>
      ) : (
        <DashboardGrid
          variant="wide"
          hero={doubleBooked && doubleLater ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{ label: tx('Doppelbuchung prüfen'), onClick: () => crud.terminbuchung.openDetail(doubleLater) }}
            >
              <b>{slotLabel(doubleBooked)}</b>{' '}
              {tx`ist doppelt vergeben (${namen((bookingsBySlot.get(doubleBooked.record_id) ?? []).map(guestName))}) — ein Termin darf nur einmal gebucht werden.`}
            </HeroBanner>
          ) : undefined}
          kpis={
            <StatStrip>
              <StatStripItem
                title={tx('Frei in 14 Tagen')}
                value={freeUpcoming.length}
                tone={freeUpcoming.length === 0 ? 'warning' : 'success'}
                onClick={() => setFilter(f => f === 'free' ? 'all' : 'free')}
                active={filter === 'free'}
              />
              <StatStripItem
                title={tx('Gebucht in 14 Tagen')}
                value={bookedUpcoming.length}
                tone="primary"
                onClick={() => setFilter(f => f === 'booked' ? 'all' : 'booked')}
                active={filter === 'booked'}
              />
              <StatStripItem
                title={tx('Neue Buchungen (7 Tage)')}
                value={newThisWeek.length}
              />
            </StatStrip>
          }
          primary={
            <CalendarWidget
              events={events}
              defaultView="week"
              views={['week', 'day', 'agenda', 'month']}
              weekDays={7}
              dayStartHour={8}
              dayEndHour={20}
              locale={dateFnsLocale()}
              onEventClick={ev => openSlot(ev.id.split(':')[1] ?? '')}
              onEventDrop={reschedule}
              onEmptyClick={date => crud.verfuegbareTermine.openCreate({ datum_uhrzeit: format(date, "yyyy-MM-dd'T'HH:mm") })}
            />
          }
          aside={
            <>
              <WorkList
                title={tx('Nächste freie Termine')}
                items={freeUpcoming.slice(0, 6).map(s => ({
                  id: s.record_id,
                  title: slotLabel(s),
                  secondLine: <span className="font-medium text-emerald-600">{tx('Frei')}</span>,
                  action: { label: tx('Buchen'), onClick: () => crud.terminbuchung.openCreate({ termin: s.record_id }) },
                }))}
                onItemClick={openSlot}
                empty={{
                  text: tx('Keine freien Termine in den nächsten zwei Wochen.'),
                  action: { label: tx('Freien Termin anlegen'), onClick: () => crud.verfuegbareTermine.openCreate({}) },
                }}
              />
              <WorkList
                title={tx('Neue Buchungen')}
                items={enrichedTerminbuchung
                  .slice()
                  .sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? ''))
                  .slice(0, 6)
                  .map(b => {
                    const slot = b.fields.termin ? verfuegbareTermineMap.get(extractRecordId(b.fields.termin) ?? '') : undefined;
                    return {
                      id: b.record_id,
                      title: guestName(b),
                      secondLine: (
                        <>
                          <span className="font-medium text-primary">{b.fields.leistung?.label ?? '—'}</span>
                          {slot?.fields.datum_uhrzeit ? <span className="text-muted-foreground"> · {slotLabel(slot)}</span> : null}
                        </>
                      ),
                      action: slot ? { label: tx('Termin'), onClick: () => openSlot(slot.record_id) } : undefined,
                    };
                  })}
                onItemClick={id => {
                  const rec = terminbuchung.find(b => b.record_id === id);
                  if (rec) crud.terminbuchung.openDetail(rec);
                }}
                empty={{
                  text: tx('Noch keine Buchungen eingegangen.'),
                  action: { label: tx('Buchung erfassen'), onClick: () => crud.terminbuchung.openCreate({}) },
                }}
              />
              <ChartWidget<Terminbuchung>
                title={tx('Buchungen je Leistung')}
                rows={rows}
                dimension={{ kind: 'category', accessor: r => r.data.fields.leistung, label: tx('Leistung') }}
                interaction={{
                  mode: 'drill',
                  onSegmentClick: seg => {
                    const rec = terminbuchung.find(b => `terminbuchung:${b.record_id}` === seg.rowIds[0]);
                    if (rec) crud.terminbuchung.openDetail(rec);
                  },
                }}
              />
            </>
          }
        />
      )}
      {crud.surfaces}
    </div>
  );
}
