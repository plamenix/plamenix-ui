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

export type {
  ColumnDescription,
  ColumnValue,
  ConnectionForm,
  CryptState,
  Profile,
  QueryResult,
  Row,
} from './db/types';
export { renderCell } from './db/types';
export { Field, type FieldProps } from './db/Field';
export { ConnectionPanel, type ConnectionPanelProps } from './db/ConnectionPanel';
export { CryptBadge, type CryptBadgeProps } from './db/CryptBadge';
export { ProfilePicker, type ProfilePickerProps } from './db/ProfilePicker';
export { QueryPanel, type QueryPanelProps } from './db/QueryPanel';
export { SqlEditor, type SqlEditorProps } from './db/SqlEditor';
export { ResultTable, type ResultTableProps } from './db/ResultTable';
