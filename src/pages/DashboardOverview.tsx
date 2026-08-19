import { useMemo, useState, useCallback } from 'react';
import { format, parseISO, isToday, isFuture, startOfDay, isSameDay } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { ResourceTimeline, type ResourceEvent, type ResourceGroup } from '@/components/widgets/ResourceTimeline';
import { LOOKUP_OPTIONS, lookupOption, APP_IDS } from '@/types/app';
import { extractRecordId, createRecordUrl, LivingAppsService } from '@/services/livingAppsService';
import { formatDateTime } from '@/lib/formatters';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import {
  IconCalendar, IconUsers, IconScissors, IconAlertCircle, IconPlus,
} from '@tabler/icons-react';

export default function DashboardOverview() {
  const data = useDashboardData();
  const {
    verfuegbareTermine, setVerfuegbareTermine,
    terminbuchung,
    verfuegbareTermineMap,
    loading, error, fetchAll,
  } = data;

  const crud = useEntityCrud(data);
  const enrichedTerminbuchung = crud.enriched.terminbuchung;
  const clock = useClock();

  // Filter state for KPI strips
  const [filter, setFilter] = useState<'all' | 'heute' | 'frei'>('all');

  // ── Derived data ─────────────────────────────────────────────────────────

  // Booking count per termin slot
  const buchungenByTermin = useMemo(() => {
    const m = new Map<string, typeof terminbuchung>();
    for (const b of terminbuchung) {
      const id = extractRecordId(b.fields.termin);
      if (!id) continue;
      const prev = m.get(id) ?? [];
      m.set(id, [...prev, b]);
    }
    return m;
  }, [terminbuchung]);

  // Free slots today or in the future with no booking
  const freiTermine = useMemo(() =>
    verfuegbareTermine.filter(t => {
      if (!t.fields.datum_uhrzeit) return false;
      const dt = parseISO(t.fields.datum_uhrzeit);
      if (!isFuture(dt) && !isToday(dt)) return false;
      return (buchungenByTermin.get(t.record_id)?.length ?? 0) === 0;
    }), [verfuegbareTermine, buchungenByTermin, clock]);

  // Slots booked today
  const heuteTermine = useMemo(() =>
    verfuegbareTermine.filter(t => {
      if (!t.fields.datum_uhrzeit) return false;
      return isToday(parseISO(t.fields.datum_uhrzeit));
    }), [verfuegbareTermine, clock]);

  // Bookings today (with enriched data)
  const heuteBuchungen = useMemo(() =>
    enrichedTerminbuchung.filter(b => {
      const terminId = extractRecordId(b.fields.termin);
      if (!terminId) return false;
      const termin = verfuegbareTermineMap.get(terminId);
      if (!termin?.fields.datum_uhrzeit) return false;
      return isToday(parseISO(termin.fields.datum_uhrzeit));
    }).sort((a, b) => {
      const tA = verfuegbareTermineMap.get(extractRecordId(a.fields.termin) ?? '')?.fields.datum_uhrzeit ?? '';
      const tB = verfuegbareTermineMap.get(extractRecordId(b.fields.termin) ?? '')?.fields.datum_uhrzeit ?? '';
      return tA.localeCompare(tB);
    }), [enrichedTerminbuchung, verfuegbareTermineMap, clock]);

  // Double-booked slots (same slot booked more than once — should be blocked, but flagged here)
  const doppeltGebucht = useMemo(() =>
    verfuegbareTermine.filter(t => (buchungenByTermin.get(t.record_id)?.length ?? 0) > 1),
    [verfuegbareTermine, buchungenByTermin]);

  // Resource groups = the two chairs (static lookup)
  const chairOptions = useMemo(() =>
    LOOKUP_OPTIONS['verfuegbare_termine']?.['stuhl'] ?? [],
    []);

  const groups = useMemo<ResourceGroup[]>(() =>
    chairOptions.map(o => ({ key: o.key, label: o.label })),
    [chairOptions]);

  // Events = available slots, colored by booking state
  const events = useMemo<ResourceEvent[]>(() =>
    verfuegbareTermine
      .filter(t => !!t.fields.datum_uhrzeit && !!t.fields.stuhl)
      .map(t => {
        const buchungen = buchungenByTermin.get(t.record_id) ?? [];
        const isBooked = buchungen.length > 0;
        const isDouble = buchungen.length > 1;
        const stuhlKey = t.fields.stuhl?.key ?? '';
        const kundenName = isBooked
          ? buchungen.map(b => `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim()).join(', ')
          : tx('Frei');
        return {
          id: `termin:${t.record_id}`,
          start: t.fields.datum_uhrzeit!,
          title: kundenName,
          subtitle: isBooked ? buchungen[0]?.fields.leistung?.label : undefined,
          tone: isDouble ? 'destructive' : isBooked ? 'primary' : 'success',
          group: stuhlKey,
        } satisfies ResourceEvent;
      }),
    [verfuegbareTermine, buchungenByTermin]);

  // Context line: who is coming today
  const kontextNamen = useMemo(() => {
    const namen_ = heuteBuchungen
      .map(b => `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim())
      .filter(Boolean);
    return namen(namen_);
  }, [heuteBuchungen]);

  // Move termin to another chair (drag cross-resource)
  const handleEventDrop = useCallback(async (id: string, newStart: string, _newEnd?: string, newGroup?: string) => {
    const terminId = id.split(':')[1] ?? '';
    if (!terminId) return;
    const termin = verfuegbareTermineMap.get(terminId);
    if (!termin) return;

    // Collision check: prevent moving to an already-booked slot (same chair+time)
    if (newGroup) {
      const conflict = verfuegbareTermine.find(t =>
        t.record_id !== terminId &&
        t.fields.datum_uhrzeit === newStart &&
        t.fields.stuhl?.key === newGroup &&
        (buchungenByTermin.get(t.record_id)?.length ?? 0) > 0
      );
      if (conflict) {
        return tx('Dieser Stuhl ist zu diesem Zeitpunkt bereits belegt');
      }
    }

    const prev = { ...termin };
    const stuhlPatch = newGroup ? lookupOption('verfuegbare_termine', 'stuhl', newGroup) : termin.fields.stuhl;

    // Optimistic update
    setVerfuegbareTermine(prev_ =>
      prev_.map(t =>
        t.record_id === terminId
          ? { ...t, fields: { ...t.fields, datum_uhrzeit: newStart, stuhl: stuhlPatch } }
          : t
      )
    );

    try {
      await LivingAppsService.updateVerfuegbareTermineEntry(terminId, {
        datum_uhrzeit: newStart,
        ...(newGroup ? { stuhl: newGroup } : {}),
      });
      undoToast(tx`${termin.fields.datum_uhrzeit ? formatDateTime(termin.fields.datum_uhrzeit) : ''} — verschoben`, () => {
        setVerfuegbareTermine(prev_ =>
          prev_.map(t =>
            t.record_id === terminId ? prev : t
          )
        );
        void LivingAppsService.updateVerfuegbareTermineEntry(terminId, {
          datum_uhrzeit: prev.fields.datum_uhrzeit,
          stuhl: prev.fields.stuhl?.key,
        });
      });
    } catch {
      await fetchAll();
    }
  }, [verfuegbareTermineMap, verfuegbareTermine, buchungenByTermin, setVerfuegbareTermine, fetchAll]);

  // Click on an event: if booked → open booking detail; if free → open termin detail
  const handleEventClick = useCallback((ev: ResourceEvent) => {
    const terminId = ev.id.split(':')[1] ?? '';
    const termin = verfuegbareTermineMap.get(terminId);
    if (!termin) return;
    const buchungen = buchungenByTermin.get(terminId);
    if (buchungen && buchungen.length > 0) {
      crud.terminbuchung.openDetail(buchungen[0]);
    } else {
      crud.verfuegbareTermine.openDetail(termin);
    }
  }, [verfuegbareTermineMap, buchungenByTermin, crud]);

  // Click on empty slot: create a new available termin at that time/chair
  const handleEmptyClick = useCallback((date: Date, group?: string) => {
    crud.verfuegbareTermine.openCreate({
      datum_uhrzeit: format(date, "yyyy-MM-dd'T'HH:mm"),
      stuhl: group ?? '',
    });
  }, [crud]);

  // Drag to create a new termin
  const handleRangeCreate = useCallback((start: Date, _end: Date, group?: string) => {
    crud.verfuegbareTermine.openCreate({
      datum_uhrzeit: format(start, "yyyy-MM-dd'T'HH:mm"),
      stuhl: group ?? '',
    });
  }, [crud]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ── Plain derivations (no hooks below) ────────────────────────────────────

  const totalHeuteTermine = heuteTermine.length;
  const nextFreeSlot = freiTermine[0];

  const heroUrgent = doppeltGebucht.length > 0;
  const heroBuchung = heroUrgent ? terminbuchung.find(b => {
    const id = extractRecordId(b.fields.termin);
    return id ? doppeltGebucht.some(t => t.record_id === id) : false;
  }) : undefined;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {gruss(clock)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {heuteBuchungen.length === 0
              ? tx('Heute sind noch keine Buchungen eingetragen.')
              : kontextNamen
                ? tx`Heute kommen ${kontextNamen} — ${totalHeuteTermine} Termin(e) auf dem Plan.`
                : tx`Heute stehen ${totalHeuteTermine} Termin(e) an.`}
          </p>
        </div>
        <button
          onClick={() => crud.verfuegbareTermine.openCreate({})}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Termin anlegen')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroUrgent && (
          <HeroBanner
            icon={<IconAlertCircle size={18} />}
            action={{
              label: tx('Doppelbuchung prüfen'),
              onClick: () => {
                const t = doppeltGebucht[0];
                if (t) crud.verfuegbareTermine.openDetail(t);
              },
            }}
          >
            {tx`Doppelte Buchung erkannt: ${doppeltGebucht.length} Termin(e) ${doppeltGebucht.length === 1 ? 'ist' : 'sind'} mehrfach vergeben — bitte prüfen.`}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Heute')}
              value={totalHeuteTermine}
              icon={<IconCalendar size={16} />}
              tone={totalHeuteTermine > 0 ? 'primary' : 'default'}
              onClick={() => setFilter(f => f === 'heute' ? 'all' : 'heute')}
              active={filter === 'heute'}
            />
            <StatStripItem
              title={tx('Buchungen gesamt')}
              value={terminbuchung.length}
              icon={<IconUsers size={16} />}
            />
            <StatStripItem
              title={tx('Freie Termine')}
              value={freiTermine.length}
              icon={<IconScissors size={16} />}
              tone={freiTermine.length === 0 ? 'warning' : 'success'}
              onClick={() => setFilter(f => f === 'frei' ? 'all' : 'frei')}
              active={filter === 'frei'}
            />
          </StatStrip>
        }
        primary={
          <ResourceTimeline
            events={events}
            groups={groups}
            axis="time"
            dayStartHour={8}
            dayEndHour={20}
            dragSnapMinutes={30}
            locale={dateFnsLocale()}
            onEventClick={handleEventClick}
            onEmptyClick={handleEmptyClick}
            onRangeCreate={handleRangeCreate}
            onEventDrop={handleEventDrop}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heutige Termine')}
              items={heuteBuchungen.map(b => {
                const terminId = extractRecordId(b.fields.termin);
                const termin = terminId ? verfuegbareTermineMap.get(terminId) : undefined;
                const uhrzeit = termin?.fields.datum_uhrzeit
                  ? format(parseISO(termin.fields.datum_uhrzeit), 'HH:mm')
                  : '—';
                const stuhlLabel = termin?.fields.stuhl?.label ?? '';
                return {
                  id: b.record_id,
                  title: `${b.fields.vorname ?? ''} ${b.fields.nachname ?? ''}`.trim() || tx('Unbekannt'),
                  secondLine: (
                    <>
                      <span className="font-medium text-foreground">{uhrzeit}</span>
                      {stuhlLabel ? <span className="text-muted-foreground"> · {stuhlLabel}</span> : null}
                      {b.fields.leistung?.label ? <span className="text-muted-foreground"> · {b.fields.leistung.label}</span> : null}
                    </>
                  ),
                };
              })}
              onItemClick={id => {
                const b = enrichedTerminbuchung.find(x => x.record_id === id);
                if (b) crud.terminbuchung.openDetail(b);
              }}
              empty={{
                text: nextFreeSlot?.fields.datum_uhrzeit
                  ? tx`Nächster freier Termin: ${formatDateTime(nextFreeSlot.fields.datum_uhrzeit)}`
                  : tx('Heute keine Termine — jetzt einen anlegen'),
                action: { label: tx('Termin anlegen'), onClick: () => crud.verfuegbareTermine.openCreate({}) },
              }}
            />
            <WorkList
              title={tx('Verfügbare Termine (diese Woche)')}
              items={freiTermine.slice(0, 8).map(t => ({
                id: t.record_id,
                title: t.fields.datum_uhrzeit
                  ? format(parseISO(t.fields.datum_uhrzeit), 'EEE dd.MM. · HH:mm', { locale: dateFnsLocale() })
                  : '—',
                secondLine: (
                  <>
                    <span className="font-medium text-emerald-600">{tx('Frei')}</span>
                    {t.fields.stuhl?.label ? <span className="text-muted-foreground"> · {t.fields.stuhl.label}</span> : null}
                  </>
                ),
                action: {
                  label: tx('+ Buchung'),
                  onClick: () => crud.terminbuchung.openCreate({
                    termin: createRecordUrl(APP_IDS.VERFUEGBARE_TERMINE, t.record_id),
                  }),
                },
              }))}
              onItemClick={id => {
                const t = verfuegbareTermine.find(x => x.record_id === id);
                if (t) crud.verfuegbareTermine.openDetail(t);
              }}
              empty={{
                text: tx('Keine freien Termine — jetzt einen anlegen'),
                action: { label: tx('Termin anlegen'), onClick: () => crud.verfuegbareTermine.openCreate({}) },
              }}
            />
          </>
        }
      />

      {crud.surfaces}
    </div>
  );
}
