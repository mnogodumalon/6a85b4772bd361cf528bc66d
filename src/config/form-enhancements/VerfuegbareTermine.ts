import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['datum_uhrzeit', 'stuhl', 'bemerkung'],
  defaults: {
    'datum_uhrzeit': { kind: 'today', withTime: true },
    'stuhl': { kind: 'lookup', key: 'stuhl_1', label: 'Stuhl 1' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};

export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
