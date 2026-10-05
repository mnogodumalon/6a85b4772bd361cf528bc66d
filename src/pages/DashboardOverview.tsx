import { useMemo, useState } from 'react';
import { addDays, addMinutes, endOfWeek, format, isBefore, isWithinInterval, parseISO, startOfWeek } from 'date-fns';
import { IconCalendarPlus, IconCut, IconScissors, IconCalendarCheck } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { extractRecordId, LivingAppsService } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { dateFnsLocale, tx } from '@/i18n';
import { gruss, namen, undoToast, useClock } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { Button } from '@/components/ui/button';
import { CalendarWidget, type CalendarEvent } from '@/components/widgets/CalendarWidget';
import { ChartWidget, type ChartRow } from '@/components/widgets/ChartWidget';
import type { Terminbuchung } from '@/types/app';
import type { EnrichedTerminbuchung } from '@/types/enriched';

const DT = "yyyy-MM-dd'T'HH:mm";

// Dauer in Minuten je Leistung — Färben braucht deutlich länger
const DAUER: Record<string, number> = { haarschnitt: 45, faerben: 120, haarschnitt_und_faerben: 150 };
const FREI_DAUER = 30;

type Filter = 'all' | 'free' | 'booked';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { verfuegbareTermine, terminbuchung, setVerfuegbareTermine } = data;
  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'verfuegbareTermine') return undefined;
      const taken = terminbuchung.some(b => extractRecordId(b.fields.termin) === top.record.record_id);
      if (taken) return undefined;
      return {
        label: tx('Termin buchen'),
        onClick: () => crud.terminbuchung.openCreate({ termin: top.record.record_id }),
      };
    },
  });
  const enrichedTerminbuchung = crud.enriched.terminbuchung;
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>('all');

  // slotId -> Buchung (ein Termin darf nur einmal vergeben werden)
  const bookingBySlot = useMemo(() => {
    const m = new Map<string, Terminbuchung>();
    terminbuchung.forEach(b => {
      const id = extractRecordId(b.fields.termin);
      if (id) m.set(id, b);
    });
    return m;
  }, [terminbuchung]);

  const slotById = useMemo(() => new Map(verfuegbareTermine.map(s => [s.record_id, s])), [verfuegbareTermine]);

  const weekStart = startOfWeek(clock, { weekStartsOn: 1 });
  const thisWeek = { start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) };
  const nextWeek = { start: addDays(weekStart, 7), end: endOfWeek(addDays(weekStart, 7), { weekStartsOn: 1 }) };

  const freeSlots = useMemo(
    () => verfuegbareTermine.filter(s =>
      s.fields.datum_uhrzeit && !bookingBySlot.has(s.record_id) && !isBefore(parseISO(s.fields.datum_uhrzeit), clock)),
    [verfuegbareTermine, bookingBySlot, clock],
  );
  const inRange = (iso: string | undefined, r: { start: Date; end: Date }) =>
    !!iso && isWithinInterval(parseISO(iso), r);
  const freeThis = freeSlots.filter(s => inRange(s.fields.datum_uhrzeit, thisWeek)).length;
  const freeNext = freeSlots.filter(s => inRange(s.fields.datum_uhrzeit, nextWeek)).length;

  const upcoming = useMemo(
    () => terminbuchung
      .map(b => ({ b, slot: slotById.get(extractRecordId(b.fields.termin) ?? '') }))
      .filter((x): x is { b: Terminbuchung; slot: NonNullable<typeof x.slot> } =>
        !!x.slot?.fields.datum_uhrzeit && !isBefore(parseISO(x.slot.fields.datum_uhrzeit), clock))
      .sort((a, c) => a.slot.fields.datum_uhrzeit!.localeCompare(c.slot.fields.datum_uhrzeit!)),
    [terminbuchung, slotById, clock],
  );

  const events = useMemo<CalendarEvent[]>(() => {
    const out: CalendarEvent[] = [];
    verfuegbareTermine.forEach(s => {
      const start = s.fields.datum_uhrzeit;
      if (!start) return;
      const b = bookingBySlot.get(s.record_id);
      const stuhl = s.fields.stuhl?.label ?? '';
      if (b) {
        if (filter === 'free') return;
        const mins = DAUER[lookupKey(b.fields.leistung) ?? ''] ?? FREI_DAUER;
        out.push({
          id: `buchung:${b.record_id}`,
          start,
          end: format(addMinutes(parseISO(start), mins), DT),
          title: `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim(),
          subtitle: `${b.fields.leistung?.label ?? ''} · ${stuhl}`,
          tone: lookupKey(b.fields.leistung) === 'haarschnitt' ? 'primary' : 'warning',
        });
      } else {
        if (filter === 'booked') return;
        out.push({
          id: `slot:${s.record_id}`,
          start,
          end: format(addMinutes(parseISO(start), FREI_DAUER), DT),
          title: tx('Frei'),
          subtitle: stuhl,
          tone: 'success',
        });
      }
    });
    return out;
  }, [verfuegbareTermine, bookingBySlot, filter]);

  // Regeln: nur freie Termine verschiebbar, ein Stuhl nie doppelt zur selben Zeit
  const ruleViolation = (slotId: string, newStart: string): string | null => {
    const slot = slotById.get(slotId);
    if (!slot) return tx('Termin nicht gefunden');
    if (bookingBySlot.has(slotId)) return tx('Gebuchte Termine können nicht verschoben werden');
    const clash = verfuegbareTermine.some(o =>
      o.record_id !== slotId &&
      o.fields.stuhl?.key === slot.fields.stuhl?.key &&
      o.fields.datum_uhrzeit?.slice(0, 16) === newStart.slice(0, 16));
    return clash ? tx('Zu dieser Zeit gibt es an diesem Stuhl schon einen Termin') : null;
  };

  const handleDrop = (eventId: string, newStart: string): string | void => {
    const [kind, id] = eventId.split(':');
    if (kind !== 'slot') return tx('Gebuchte Termine können nicht verschoben werden');
    const bad = ruleViolation(id, newStart);
    if (bad) return bad;
    const old = slotById.get(id)?.fields.datum_uhrzeit;
    const next = newStart.slice(0, 16);
    setVerfuegbareTermine(prev => prev.map(s => s.record_id === id ? { ...s, fields: { ...s.fields, datum_uhrzeit: next } } : s));
    const write = (v: string | undefined) =>
      LivingAppsService.updateVerfuegbareTermineEntry(id, { datum_uhrzeit: v }).catch(() => data.fetchAll());
    void write(next);
    undoToast(tx('Termin verschoben'), () => {
      setVerfuegbareTermine(prev => prev.map(s => s.record_id === id ? { ...s, fields: { ...s.fields, datum_uhrzeit: old } } : s));
      void write(old);
    });
  };

  const onEventClick = (ev: CalendarEvent) => {
    const [kind, id] = ev.id.split(':');
    if (kind === 'buchung') {
      const b = terminbuchung.find(x => x.record_id === id);
      if (b) crud.terminbuchung.openDetail(b);
    } else {
      const s = verfuegbareTermine.find(x => x.record_id === id);
      if (s) crud.verfuegbareTermine.openDetail(s);
    }
  };

  const chartRows = useMemo<ChartRow<EnrichedRow>[]>(
    () => enrichedTerminbuchung.map(b => ({ id: `buchung:${b.record_id}`, data: b })),
    [enrichedTerminbuchung],
  );

  const dayLabel = (iso: string) => format(parseISO(iso), 'EEE d.M. HH:mm', { locale: dateFnsLocale() });

  const context = upcoming.length > 0
    ? tx`${gruss(clock)} Als Nächstes kommt ${namen(upcoming.slice(0, 3).map(x => x.b.fields.vorname ?? ''))} — ${freeThis + freeNext} Termine sind in den nächsten zwei Wochen noch frei.`
    : freeSlots.length > 0
      ? tx`${gruss(clock)} Noch keine anstehenden Buchungen — ${freeSlots.length} freie Termine warten auf Kunden.`
      : tx`${gruss(clock)} Lege freie Termine an, damit Kunden online buchen können.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{tx('Terminplaner')}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        <Button onClick={() => crud.verfuegbareTermine.openCreate({})} className="shrink-0">
          <IconCalendarPlus size={16} className="shrink-0" />
          <span>{tx('Freien Termin anlegen')}</span>
        </Button>
      </div>

      <DashboardGrid
        variant="split"
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Frei diese Woche')}
              value={freeThis}
              icon={<IconCut size={16} className="text-muted-foreground" />}
              tone={freeThis > 0 ? 'success' : 'default'}
              onClick={() => setFilter(f => (f === 'free' ? 'all' : 'free'))}
              active={filter === 'free'}
            />
            <StatStripItem
              title={tx('Frei nächste Woche')}
              value={freeNext}
              icon={<IconScissors size={16} className="text-muted-foreground" />}
              tone={freeNext > 0 ? 'success' : 'default'}
              onClick={() => setFilter(f => (f === 'free' ? 'all' : 'free'))}
              active={filter === 'free'}
            />
            <StatStripItem
              title={tx('Anstehende Buchungen')}
              value={upcoming.length}
              icon={<IconCalendarCheck size={16} className="text-muted-foreground" />}
              tone="primary"
              onClick={() => setFilter(f => (f === 'booked' ? 'all' : 'booked'))}
              active={filter === 'booked'}
            />
          </StatStrip>
        }
        aside={
          <>
            <WorkList
              title={tx('Anstehende Buchungen')}
              max={6}
              items={upcoming.map(({ b, slot }) => ({
                id: b.record_id,
                title: `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim(),
                secondLine: (
                  <>
                    <span className="font-medium">{b.fields.leistung?.label}</span>
                    <span className="text-muted-foreground"> · {dayLabel(slot.fields.datum_uhrzeit!)} · {slot.fields.stuhl?.label}</span>
                  </>
                ),
              }))}
              onItemClick={id => {
                const b = terminbuchung.find(x => x.record_id === id);
                if (b) crud.terminbuchung.openDetail(b);
              }}
              empty={{
                text: tx('Noch keine Buchungen — Kunden buchen online freie Termine.'),
                action: { label: tx('Freien Termin anlegen'), onClick: () => crud.verfuegbareTermine.openCreate({}) },
              }}
            />
            <ChartWidget<EnrichedRow>
              title={tx('Buchungen je Leistung')}
              rows={chartRows}
              dimension={{ kind: 'category', accessor: r => r.data.fields.leistung, label: tx('Leistung') }}
              interaction={{
                mode: 'drill',
                onSegmentClick: seg => {
                  const first = terminbuchung.find(b => `buchung:${b.record_id}` === seg.rowIds[0]);
                  if (first) crud.terminbuchung.openDetail(first);
                },
              }}
            />
          </>
        }
        primary={
          <CalendarWidget
            events={events}
            defaultView="week"
            weekDays={7}
            weekStartsOn={1}
            dayStartHour={8}
            dayEndHour={20}
            locale={dateFnsLocale()}
            onEventClick={onEventClick}
            onEventDrop={handleDrop}
            onEmptyClick={d => crud.verfuegbareTermine.openCreate({ datum_uhrzeit: format(d, DT) })}
          />
        }
      />
      {crud.surfaces}
    </div>
  );
}

type EnrichedRow = EnrichedTerminbuchung;
