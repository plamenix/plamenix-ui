/**
 * @plamenix/ui — shared React library consumed by the Plamenix desktop and
 * web editions.
 *
 * The library is transport-agnostic: every host interaction goes through a
 * {@link Transport} implementation supplied by the consuming edition.
 * Components, hooks, and stores accrete here as concrete consumers need
 * them; new exports are added when a second consumer needs the same shape,
 * not preemptively.
 */

export type { Transport } from './transport';
export { TransportError } from './transport';
