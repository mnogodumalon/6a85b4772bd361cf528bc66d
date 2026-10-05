import type { Terminbuchung } from './app';

export type EnrichedTerminbuchung = Terminbuchung & {
  terminName: string;
};
