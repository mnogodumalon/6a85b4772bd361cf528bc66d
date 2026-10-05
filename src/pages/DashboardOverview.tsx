import { useMemo, useState } from 'react';
import { addMinutes, addWeeks, endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import { IconAlertTriangle, IconCalendarPlus, IconCut, IconPalette, IconArmchair } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import type { VerfuegbareTermine } from '@/types/app';
import { lookupKey } from '@/lib/formatters';
import { LivingAppsService } from '@/services/livingAppsService';
import { appLabel, tx, dateFnsLocale } from '@/i18n';
import { gruss, namen, undoToast, useClock } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { Button } from '@/components/ui/button';
import { CalendarWidget, type CalendarEvent } from '@/components/widgets/CalendarWidget';
import { ChartWidget } from '@/components/widgets/ChartWidget';

type Filter = 'all' | 'free' | 'booked' | 'color';

const COLOR_KEYS = ['faerben', 'haarschnitt_und_faerben'];
const COLOR_BLOCK_MIN = 90; // Färben blockiert den Stuhl für die Folgezeit

const TS = "yyyy-MM-dd'T'HH:mm";

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { verfuegbareTermine, terminbuchung, setVerfuegbareTermine } = data;
  const crud = useEntityCrud(data);
  const enrichedTerminbuchung = crud.enriched.terminbuchung;
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>('all');

  const nowKey = format(clock, TS);
  const windowStart = format(startOfWeek(clock, { weekStartsOn: 1 }), TS);
  const windowEnd = format(endOfWeek(addWeeks(clock, 1), { weekStartsOn: 1 }), TS);

  const model = useMemo(() => {
    const bookingsBySlot = new Map<string, typeof enrichedTerminbuchung>();
    for (const b of enrichedTerminbuchung) {
      const m = String(b.fields.termin ?? '').match(/([a-f0-9]{24})$/i);
      if (!m) continue;
      const list = bookingsBySlot.get(m[1]) ?? [];
      list.push(b);
      bookingsBySlot.set(m[1], list);
    }
    const slots = verfuegbareTermine.filter(s => !!s.fields.datum_uhrzeit);
    const inWindow = (s: VerfuegbareTermine) => {
      const d = s.fields.datum_uhrzeit!;
      return d >= windowStart && d <= windowEnd;
    };
    const upcoming = (s: VerfuegbareTermine) => s.fields.datum_uhrzeit! >= nowKey && inWindow(s);
    const isColor = (s: VerfuegbareTermine) =>
      (bookingsBySlot.get(s.record_id) ?? []).some(b => COLOR_KEYS.includes(lookupKey(b.fields.leistung) ?? ''));

    // Konflikte: Doppelbuchung oder Folgetermin am selben Stuhl während Färben
    const conflicts: { slot: VerfuegbareTermine; booking: (typeof enrichedTerminbuchung)[number]; reason: 'double' | 'color' }[] = [];
    for (const s of slots) {
      const bs = bookingsBySlot.get(s.record_id) ?? [];
      if (bs.length > 1) conflicts.push({ slot: s, booking: bs[1], reason: 'double' });
      if (!isColor(s)) continue;
      const start = parseISO(s.fields.datum_uhrzeit!);
      const limit = format(addMinutes(start, COLOR_BLOCK_MIN), TS);
      for (const o of slots) {
        if (o.record_id === s.record_id || lookupKey(o.fields.stuhl) !== lookupKey(s.fields.stuhl)) continue;
        const od = o.fields.datum_uhrzeit!;
        if (od > s.fields.datum_uhrzeit! && od <= limit && (bookingsBySlot.get(o.record_id) ?? []).length > 0) {
          conflicts.push({ slot: o, booking: bookingsBySlot.get(o.record_id)![0], reason: 'color' });
        }
      }
    }
    return { bookingsBySlot, slots, inWindow, upcoming, isColor, conflicts };
  }, [verfuegbareTermine, enrichedTerminbuchung, windowStart, windowEnd, nowKey]);

  const { bookingsBySlot, slots, upcoming, isColor, conflicts } = model;
  const conflictSlotIds = new Set(conflicts.map(c => c.slot.record_id));

  const freeUpcoming = slots.filter(s => upcoming(s) && !bookingsBySlot.has(s.record_id));
  const bookedUpcoming = slots
    .filter(s => upcoming(s) && bookingsBySlot.has(s.record_id))
    .sort((a, b) => a.fields.datum_uhrzeit!.localeCompare(b.fields.datum_uhrzeit!));
  const colorUpcoming = bookedUpcoming.filter(isColor);

  const nameOf = (b: { fields: { vorname?: string; nachname?: string } }) =>
    `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim();
  const when = (s: VerfuegbareTermine) =>
    format(parseISO(s.fields.datum_uhrzeit!), 'EEE d.M. HH:mm', { locale: dateFnsLocale() });

  const events: CalendarEvent[] = slots
    .filter(s => {
      const booked = bookingsBySlot.has(s.record_id);
      if (filter === 'free') return !booked;
      if (filter === 'booked') return booked;
      if (filter === 'color') return isColor(s);
      return true;
    })
    .map(s => {
      const bs = bookingsBySlot.get(s.record_id) ?? [];
      const b = bs[0];
      const stuhl = s.fields.stuhl?.label ?? '';
      return {
        id: `termin:${s.record_id}`,
        start: s.fields.datum_uhrzeit!,
        title: b ? nameOf(b) || tx('Gebucht') : tx('Frei'),
        subtitle: b ? `${stuhl} · ${b.fields.leistung?.label ?? ''}` : stuhl,
        tone: conflictSlotIds.has(s.record_id) ? 'destructive' : b ? (isColor(s) ? 'warning' : 'primary') : 'success',
      } as CalendarEvent;
    });

  // Verschieben per Drag: ein Stuhl kann zur selben Zeit nur einen Termin haben
  const onEventDrop = (eventId: string, newStart: string): string | undefined => {
    const id = eventId.split(':')[1];
    const slot = verfuegbareTermine.find(s => s.record_id === id);
    if (!slot) return undefined;
    const clash = verfuegbareTermine.find(
      s => s.record_id !== id && s.fields.datum_uhrzeit === newStart && lookupKey(s.fields.stuhl) === lookupKey(slot.fields.stuhl),
    );
    if (clash) return tx('An dieser Zeit gibt es an diesem Stuhl bereits einen Termin.');
    const old = slot.fields.datum_uhrzeit;
    setVerfuegbareTermine(prev => prev.map(s => (s.record_id === id ? { ...s, fields: { ...s.fields, datum_uhrzeit: newStart } } : s)));
    LivingAppsService.updateVerfuegbareTermineEntry(id, { datum_uhrzeit: newStart })
      .then(() =>
        undoToast(tx('Termin verschoben'), () => {
          setVerfuegbareTermine(prev => prev.map(s => (s.record_id === id ? { ...s, fields: { ...s.fields, datum_uhrzeit: old } } : s)));
          void LivingAppsService.updateVerfuegbareTermineEntry(id, { datum_uhrzeit: old });
        }),
      )
      .catch(() => void data.fetchAll());
    return undefined;
  };

  const toggle = (f: Filter) => setFilter(cur => (cur === f ? 'all' : f));

  const firstConflict = conflicts[0];
  const context = (() => {
    const next = bookedUpcoming[0];
    if (bookedUpcoming.length === 0) {
      return freeUpcoming.length > 0
        ? tx`Noch keine Buchungen — ${freeUpcoming.length} freie Termine warten auf Kunden.`
        : tx('Noch keine Termine angelegt — lege freie Termine für beide Stühle an.');
    }
    const names = namen(bookedUpcoming.slice(0, 3).map(s => nameOf(bookingsBySlot.get(s.record_id)![0])));
    return tx`Als Nächstes kommen ${names} — ${next ? when(next) : ''}. Noch ${freeUpcoming.length} Termine frei.`;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.verfuegbareTermine.canWrite && (
          <Button onClick={() => crud.verfuegbareTermine.openCreate({})} className="w-full sm:w-auto">
            <IconCalendarPlus size={16} className="mr-2 shrink-0" />
            {tx('Freien Termin anlegen')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="split"
        hero={
          firstConflict ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{ label: tx('Prüfen'), onClick: () => crud.terminbuchung.openDetail(firstConflict.booking) }}
            >
              {firstConflict.reason === 'double'
                ? tx`Doppelbelegung: ${when(firstConflict.slot)} (${firstConflict.slot.fields.stuhl?.label ?? ''}) ist mehrfach gebucht — ${nameOf(firstConflict.booking)}.`
                : tx`Färben dauert länger: ${nameOf(firstConflict.booking)} liegt am ${when(firstConflict.slot)} direkt nach einem Färbetermin am selben Stuhl.`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Frei (2 Wochen)')}
              value={freeUpcoming.length}
              icon={<IconArmchair size={18} />}
              tone="success"
              onClick={() => toggle('free')}
              active={filter === 'free'}
            />
            <StatStripItem
              title={tx('Gebucht')}
              value={bookedUpcoming.length}
              icon={<IconCut size={18} />}
              tone="primary"
              onClick={() => toggle('booked')}
              active={filter === 'booked'}
            />
            <StatStripItem
              title={tx('Mit Färben')}
              value={colorUpcoming.length}
              icon={<IconPalette size={18} />}
              tone={colorUpcoming.length > 0 ? 'warning' : 'default'}
              onClick={() => toggle('color')}
              active={filter === 'color'}
            />
          </StatStrip>
        }
        aside={
          <>
            <WorkList
              title={tx('Anstehende Buchungen')}
              items={bookedUpcoming.map(s => {
                const b = bookingsBySlot.get(s.record_id)![0];
                return {
                  id: s.record_id,
                  title: nameOf(b) || tx('Gebucht'),
                  secondLine: (
                    <>
                      <span className="font-medium">{b.fields.leistung?.label ?? '—'}</span>
                      <span className="text-muted-foreground"> · {when(s)} · {s.fields.stuhl?.label}</span>
                    </>
                  ),
                };
              })}
              onItemClick={id => {
                const s = verfuegbareTermine.find(x => x.record_id === id);
                if (s) crud.verfuegbareTermine.openDetail(s);
              }}
              empty={{
                text: freeUpcoming[0]
                  ? tx`Keine Buchungen — nächster freier Termin: ${when(freeUpcoming[0])}`
                  : tx('Keine Buchungen und keine freien Termine.'),
                action: crud.verfuegbareTermine.canWrite
                  ? { label: tx('Freien Termin anlegen'), onClick: () => crud.verfuegbareTermine.openCreate({}) }
                  : undefined,
              }}
            />
            <ChartWidget
              title={tx('Gewünschte Leistungen')}
              rows={bookedUpcoming.flatMap(s =>
                (bookingsBySlot.get(s.record_id) ?? []).map(b => ({ id: `terminbuchung:${b.record_id}`, data: b })),
              )}
              dimension={{ kind: 'category', accessor: r => r.data.fields.leistung, label: tx('Leistung') }}
            />
          </>
        }
        primary={
          <CalendarWidget
            events={events}
            defaultView="week"
            locale={dateFnsLocale()}
            weekDays={7}
            onEventClick={ev => {
              const s = verfuegbareTermine.find(x => x.record_id === ev.id.split(':')[1]);
              if (s) crud.verfuegbareTermine.openDetail(s);
            }}
            onEventDrop={crud.verfuegbareTermine.canWrite ? onEventDrop : undefined}
            onEmptyClick={
              crud.verfuegbareTermine.canWrite
                ? date => crud.verfuegbareTermine.openCreate({ datum_uhrzeit: format(date, TS) })
                : undefined
            }
          />
        }
      />
      <span className="sr-only">{appLabel('terminbuchung')} {terminbuchung.length}</span>
      {crud.surfaces}
    </div>
  );
}
