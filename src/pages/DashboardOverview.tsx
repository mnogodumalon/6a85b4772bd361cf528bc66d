import { useMemo, useState } from 'react';
import { addDays, addMinutes, format, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { IconAlertTriangle, IconCalendarPlus, IconCalendarEvent, IconScissors, IconUserPlus } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { extractRecordId } from '@/services/livingAppsService';
import { appLabel, dateFnsLocale, tx } from '@/i18n';
import { gruss, namen, useClock } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { CalendarWidget, useCalendar, type CalendarEvent } from '@/components/widgets/CalendarWidget';
import { ChartWidget, type ChartRow } from '@/components/widgets/ChartWidget';
import type { Terminbuchung } from '@/types/app';

const FMT = "yyyy-MM-dd'T'HH:mm";

// Dauer je Leistung in Minuten — Färben belegt den Stuhl länger.
function dauer(leistungKey: string | undefined): number {
  if (leistungKey === 'haarschnitt_und_faerben') return 150;
  if (leistungKey === 'faerben') return 105;
  return 45;
}

type Filter = 'all' | 'free' | 'booked';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { verfuegbareTermine, terminbuchung } = data;

  const clock = useClock();
  const cal = useCalendar({ initialView: 'week' });
  const [filter, setFilter] = useState<Filter>('all');

  const crud = useEntityCrud(data, {
    footer: (top) =>
      top.type === 'verfuegbareTermine' && !bookingsByTermin.has(top.record.record_id)
        ? {
            label: tx('Buchung anlegen'),
            onClick: () => crud.terminbuchung.openCreate({ termin: top.record.record_id }),
          }
        : undefined,
  });
  const enrichedTerminbuchung = crud.enriched.terminbuchung;

  // Buchungen je Termin-ID
  const bookingsByTermin = useMemo(() => {
    const m = new Map<string, Terminbuchung[]>();
    for (const b of terminbuchung) {
      const id = extractRecordId(b.fields.termin);
      if (!id) continue;
      m.set(id, [...(m.get(id) ?? []), b]);
    }
    return m;
  }, [terminbuchung]);

  const terminById = data.verfuegbareTermineMap;
  const nowKey = format(clock, FMT);

  const upcoming = useMemo(() => {
    return terminbuchung
      .map(b => {
        const id = extractRecordId(b.fields.termin);
        const t = id ? terminById.get(id) : undefined;
        return { b, t, when: t?.fields.datum_uhrzeit };
      })
      .filter((x): x is typeof x & { when: string } => !!x.when && x.when >= nowKey)
      .sort((a, c) => String(a.when).localeCompare(String(c.when)));
  }, [terminbuchung, terminById, nowKey]);

  const freeSlots = useMemo(
    () => verfuegbareTermine.filter(t => !!t.fields.datum_uhrzeit && t.fields.datum_uhrzeit >= nowKey && !bookingsByTermin.has(t.record_id)),
    [verfuegbareTermine, bookingsByTermin, nowKey],
  );

  const thisWeek = startOfWeek(clock, { weekStartsOn: 1 });
  const nextWeek = addDays(thisWeek, 7);
  const weekEnd = (w: Date) => format(addDays(w, 7), 'yyyy-MM-dd');
  const freeIn = (w: Date) => freeSlots.filter(t => {
    const d = t.fields.datum_uhrzeit!;
    return d >= format(w, 'yyyy-MM-dd') && d < weekEnd(w);
  }).length;
  const freeThis = freeIn(thisWeek);
  const freeNext = freeIn(nextWeek);

  // Doppelbuchungen (dürfen nicht vorkommen) → Hero
  const doubles = useMemo(
    () => [...bookingsByTermin.entries()].filter(([, l]) => l.length > 1),
    [bookingsByTermin],
  );

  const events = useMemo<CalendarEvent[]>(() => {
    const out: CalendarEvent[] = [];
    for (const t of verfuegbareTermine) {
      const start = t.fields.datum_uhrzeit;
      if (!start) continue;
      const bookings = bookingsByTermin.get(t.record_id) ?? [];
      const stuhl = t.fields.stuhl?.label ?? '';
      if (bookings.length === 0) {
        if (filter === 'booked') continue;
        out.push({
          id: `termin:${t.record_id}`,
          start,
          end: format(addMinutes(parseISO(start), 45), FMT),
          title: tx`Frei · ${stuhl}`,
          tone: start >= nowKey ? 'success' : 'default',
        });
      } else {
        if (filter === 'free') continue;
        const b = bookings[0];
        const name = `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim() || tx('Ohne Namen');
        out.push({
          id: `buchung:${b.record_id}`,
          start,
          end: format(addMinutes(parseISO(start), dauer(b.fields.leistung?.key)), FMT),
          title: name,
          subtitle: `${b.fields.leistung?.label ?? ''} · ${stuhl}`,
          tone: bookings.length > 1 ? 'destructive' : b.fields.leistung?.key === 'haarschnitt' ? 'primary' : 'warning',
        });
      }
    }
    return out;
  }, [verfuegbareTermine, bookingsByTermin, filter, nowKey]);

  const chartRows = useMemo<ChartRow<Terminbuchung>[]>(
    () => terminbuchung.map(b => ({ id: `terminbuchung:${b.record_id}`, data: b })),
    [terminbuchung],
  );

  const goWeek = (w: Date) => {
    cal.setView('week');
    cal.setCursor(w);
  };
  const sameWeek = (w: Date) => startOfWeek(cal.cursor, { weekStartsOn: 1 }).getTime() === w.getTime();

  // Kontextzeile — nennt immer Personen/Dinge
  const today = upcoming.filter(x => isSameDay(parseISO(x.when), clock));
  const nameOf = (b: Terminbuchung) => b.fields.vorname || b.fields.nachname || tx('Gast');
  let context: string;
  if (today.length > 0) {
    const n = namen(today.map(x => nameOf(x.b)));
    const first = format(parseISO(today[0].when), 'HH:mm');
    context = tx`Heute kommen ${n} — der Erste um ${first} Uhr.`;
  } else if (upcoming.length > 0) {
    const n = nameOf(upcoming[0].b);
    const day = format(parseISO(upcoming[0].when), 'EEEE, HH:mm', { locale: dateFnsLocale() });
    context = tx`Heute ist nichts gebucht — als Nächstes kommt ${n} (${day} Uhr).`;
  } else if (freeSlots.length > 0) {
    const stuhl = freeSlots[0].fields.stuhl?.label ?? '';
    context = tx`Noch keine Buchung — ${freeSlots.length} freie Termine warten, der nächste an ${stuhl}.`;
  } else {
    context = tx`Lege freie Termine für Stuhl 1 und Stuhl 2 an, damit Kunden buchen können.`;
  }

  const openBooking = (id: string) => {
    const rec = terminbuchung.find(b => b.record_id === id);
    if (rec) crud.terminbuchung.openDetail(rec);
  };

  const double = doubles[0];
  const doubleTermin = double ? terminById.get(double[0]) : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
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

      <DashboardGrid
        variant="wide"
        hero={
          double && doubleTermin ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{ label: tx('Buchungen prüfen'), onClick: () => crud.terminbuchung.openDetail(double[1][1]) }}
            >
              <b>{namen(double[1].map(nameOf))}</b>{' '}
              {tx`haben denselben Termin gebucht (${format(parseISO(doubleTermin.fields.datum_uhrzeit ?? ''), 'dd.MM. HH:mm')} Uhr, ${doubleTermin.fields.stuhl?.label ?? ''}).`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Frei diese Woche')}
              value={freeThis}
              icon={<IconCalendarEvent size={16} />}
              tone={freeThis > 0 ? 'success' : 'default'}
              onClick={() => {
                const on = filter === 'free' && sameWeek(thisWeek);
                goWeek(thisWeek);
                setFilter(on ? 'all' : 'free');
              }}
              active={filter === 'free' && sameWeek(thisWeek)}
            />
            <StatStripItem
              title={tx('Frei nächste Woche')}
              value={freeNext}
              icon={<IconCalendarEvent size={16} />}
              tone={freeNext > 0 ? 'success' : 'default'}
              onClick={() => {
                const on = filter === 'free' && sameWeek(nextWeek);
                goWeek(nextWeek);
                setFilter(on ? 'all' : 'free');
              }}
              active={filter === 'free' && sameWeek(nextWeek)}
            />
            <StatStripItem
              title={tx('Anstehende Buchungen')}
              value={upcoming.length}
              icon={<IconScissors size={16} />}
              onClick={() => setFilter(f => (f === 'booked' ? 'all' : 'booked'))}
              active={filter === 'booked'}
            />
          </StatStrip>
        }
        primary={
          <CalendarWidget
            events={events}
            view={cal.view}
            referenceDate={cal.cursor}
            locale={dateFnsLocale()}
            onViewChange={cal.setView}
            onCursorChange={cal.setCursor}
            weekLayout="hours"
            onEventClick={ev => {
              const [kind, id] = ev.id.split(':');
              if (kind === 'buchung') openBooking(id);
              else {
                const rec = verfuegbareTermine.find(t => t.record_id === id);
                if (rec) crud.verfuegbareTermine.openDetail(rec);
              }
            }}
            onEmptyClick={date => crud.verfuegbareTermine.openCreate({ datum_uhrzeit: format(date, FMT) })}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Anstehende Buchungen')}
              icon={<IconScissors size={16} />}
              items={upcoming.map(({ b, t, when }) => ({
                id: b.record_id,
                title: `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim() || tx('Ohne Namen'),
                secondLine: (
                  <>
                    <span className="font-medium text-foreground">{b.fields.leistung?.label ?? tx('Leistung offen')}</span>
                    <span className="text-muted-foreground">
                      {' · '}
                      {format(parseISO(when), 'EEE dd.MM. HH:mm', { locale: dateFnsLocale() })}
                      {' · '}
                      {t?.fields.stuhl?.label ?? ''}
                    </span>
                  </>
                ),
              }))}
              onItemClick={openBooking}
              max={6}
              empty={{
                text: freeSlots.length > 0
                  ? tx`Noch keine Buchung — ${freeSlots.length} Termine sind frei.`
                  : tx('Noch keine Buchung und keine freien Termine.'),
                action: { label: tx('Freien Termin anlegen'), onClick: () => crud.verfuegbareTermine.openCreate({}) },
              }}
            />
            <ChartWidget
              title={tx('Buchungen pro Leistung')}
              rows={chartRows}
              dimension={{
                kind: 'category',
                accessor: r => r.data.fields.leistung,
                label: tx('Leistung'),
              }}
              measure={{ aggregate: 'count', label: tx('Buchungen') }}
              emptyLabel={tx('Noch keine Buchungen')}
            />
          </>
        }
      />
      {crud.surfaces}
    </div>
  );
}
