import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [{ row: ['vorname', 'nachname'] }, 'telefon', 'email', 'termin', 'leistung', 'besondere_wuensche'],
  defaults: {
    'leistung': { kind: 'lookup', key: 'haarschnitt', label: 'Haarschnitt' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};

export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
