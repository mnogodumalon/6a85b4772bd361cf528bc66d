import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
/** A raw record URL (applookup reference). NEVER render this directly
 *  in JSX — it is a URL, not a display value. Show the enriched `*Name`
 *  field or resolve it via the entity map instead. Assignable to/from
 *  string everywhere; the `& {}` keeps the alias NAME visible in tsc
 *  error messages (a plain primitive alias gets normalized away). */
export type RecordUrl = string & {};
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface VerfuegbareTermine {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    datum_uhrzeit?: string; // Format: YYYY-MM-DD oder ISO String
    stuhl?: LookupValue;
    bemerkung?: string;
  };
}

export interface Terminbuchung {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    telefon?: string;
    email?: string;
    termin?: RecordUrl; // applookup -> URL zu 'VerfuegbareTermine' Record
    leistung?: LookupValue;
    besondere_wuensche?: string;
  };
}

export const APP_IDS = {
  VERFUEGBARE_TERMINE: '6a85b4674f059d5c7d13e874',
  TERMINBUCHUNG: '6a85b469400587dd961ffdfa',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'verfuegbare_termine': {
    stuhl: [{ key: "stuhl_1", get label() { return lookupLabel('verfuegbare_termine', 'stuhl', "stuhl_1") ?? "Stuhl 1"; } }, { key: "stuhl_2", get label() { return lookupLabel('verfuegbare_termine', 'stuhl', "stuhl_2") ?? "Stuhl 2"; } }],
  },
  'terminbuchung': {
    leistung: [{ key: "haarschnitt", get label() { return lookupLabel('terminbuchung', 'leistung', "haarschnitt") ?? "Haarschnitt"; } }, { key: "faerben", get label() { return lookupLabel('terminbuchung', 'leistung', "faerben") ?? "Färben"; } }, { key: "haarschnitt_und_faerben", get label() { return lookupLabel('terminbuchung', 'leistung', "haarschnitt_und_faerben") ?? "Haarschnitt und Färben"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'verfuegbare_termine': {
    'datum_uhrzeit': 'date/datetimeminute',
    'stuhl': 'lookup/radio',
    'bemerkung': 'string/textarea',
  },
  'terminbuchung': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'telefon': 'string/tel',
    'email': 'string/email',
    'termin': 'applookup/select',
    'leistung': 'lookup/radio',
    'besondere_wuensche': 'string/textarea',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateVerfuegbareTermine = StripLookup<VerfuegbareTermine['fields']>;
export type CreateTerminbuchung = StripLookup<Terminbuchung['fields']>;