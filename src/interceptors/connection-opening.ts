/**
 * `connection.opening` interceptor chain (I6.15) — runs BEFORE the
 * host attaches to a Firebird database. Handlers can veto the attach
 * (typical use: production-host gates, hostname allow-lists,
 * compliance "you must SSH-tunnel to this DB" workflows).
 *
 * The shell wraps the connect call:
 *
 *     const decision = await connectionOpeningChain.run(ctx);
 *     if (decision.action === 'cancel') {
 *       // surface decision.reason; keep the connect screen open;
 *       // do not call host.attach
 *       return;
 *     }
 *     await host.attach(config);
 *
 * No built-in interceptors today. A future "cleartext-password
 * warning" built-in is plausible but conditional on tooling for
 * detecting whether the connection actually rides cleartext (the
 * Firebird wire protocol negotiates encryption per-attach; the
 * decision isn't local to the form).
 *
 * Veto-only; no modification — handlers CANNOT rewrite the connect
 * target. Same rationale as the other I6.12-I6.14 chains.
 *
 * NOTE: `password` is intentionally NOT in the context. Interceptor
 * handlers (especially plugin-supplied ones) should not see plaintext
 * credentials. Policies that need to gate by user identity gate on
 * `user`; policies that need to gate by deployment gate on `host` /
 * `database`.
 */

import { InterceptorChain } from './chain.js';

/** Context passed to every `connection.opening` handler. Frozen at
 *  call time — handlers MAY NOT mutate fields.
 *
 *  Mirrors {@link ConnectionForm} minus the sensitive fields
 *  (`password`, `encryptionKey`) and the host-runtime details
 *  (`fbclientPath`) that policy code shouldn't care about. */
export interface ConnectionOpeningContext {
  tabId: string;
  /** Profile id the connect is from, or `null` for an ad-hoc
   *  one-off attach (typed straight into the connect form, not
   *  saved). */
  profileId: string | null;
  host: string;
  port: number;
  database: string;
  user: string;
  /** When `true`, the attach uses the pure-Rust wire driver
   *  (rsfbclient's Rust backend). When `false`, the host loads the
   *  native fbclient library. Policies may differ — pure-Rust never
   *  loads a native dll, so it's the safer pick on locked-down
   *  systems. */
  pureRust: boolean;
  /** When `true`, the attach will refuse to connect to a database
   *  whose `MON$CRYPT_STATE` is not `1` (encrypted). Compliance
   *  policies can require this to be true for production hosts. */
  encryptionRequired: boolean;
  /** Wire charset (typically `UTF8`). Policies may pin a charset for
   *  specific deployments. */
  charset: string;
}

/** Singleton chain instance. Plugins call `connectionOpeningChain.use(...)`
 *  to register their handlers; the shell calls `.run(ctx)` from the
 *  connect screen handler before invoking `host.attach`. */
export const connectionOpeningChain =
  new InterceptorChain<ConnectionOpeningContext>();
