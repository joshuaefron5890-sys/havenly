// TEMPORARY diagnostic tool — TestFlight builds have been hard-crashing on
// launch with no visible JS error message: Apple's own crash reports only
// show native symbol offsets/queue names, never the original JS error or
// its stack, and getting a live console log off a real device turned out
// to need tooling (Console.app device access, a working local Xcode/
// CocoaPods toolchain) that wasn't readily available.
//
// Earlier attempts overrode global.ErrorUtils's handler and console.error,
// but every crash log still showed the exact same
// RCTExceptionsManager.reportException call chain regardless. Reading
// react-native's own Libraries/Core/ExceptionsManager.js explains why:
// both the uncaught-exception handler and console.error's own reporting
// path eventually call `NativeExceptionsManager.reportException(data)` —
// and react-native/expo's own core setup re-installs ITS OWN console.error
// and ErrorUtils wrappers later, during expo-router/entry's own module
// graph (after this file's index.js caller already ran), silently
// replacing ours before this even had a chance to matter.
//
// NativeExceptionsManager's default export (see
// react-native/Libraries/Core/NativeExceptionsManager.js /
// react-native/src/private/specs_DEPRECATED/modules/NativeExceptionsManager.js)
// is a plain, mutable object — not frozen — and it's the one true choke
// point every path above funnels through right before the native crash.
// Patching its methods directly here, rather than the wrappers upstream of
// it, means it doesn't matter which path (or in what order) actually
// triggers — nothing downstream of this can still reach native.
//
// Installed from index.js — the actual JS entry point (package.json's
// "main") — so this module is required (and NativeExceptionsManager's
// methods overwritten) before anything else, including expo-router's own
// startup, has a chance to run. State lives here as a shared module
// singleton, so index.js (which installs it) and app/_layout.tsx (which
// displays it) see the same value.
//
// Remove installFatalErrorDisplay(), its call site in index.js, and the
// error-screen branch in app/_layout.tsx once the real bug behind this is
// found and fixed — this is a one-time diagnostic aid, not a permanent
// replacement for letting a genuine fatal error crash or a console.error
// log normally.
type Listener = (text: string) => void;

let fatalErrorText: string | null = null;
let listener: Listener | null = null;

// Only the first capture wins — on a crash-on-launch, that's the actual
// root cause; anything after it is likely cascading noise from the app
// tree half-unmounting.
function capture(text: string): void {
  if (fatalErrorText) return;
  fatalErrorText = text;
  listener?.(text);
}

export function getFatalErrorText(): string | null {
  return fatalErrorText;
}

export function subscribeFatalError(fn: Listener | null): void {
  listener = fn;
}

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function stackToText(stack: unknown): string {
  if (!Array.isArray(stack)) return '(no stack)';
  return stack
    .map((frame: any) => `  at ${frame?.methodName ?? '?'} (${frame?.file ?? '?'}:${frame?.lineNumber ?? '?'})`)
    .join('\n');
}

export function installFatalErrorDisplay(): void {
  // Native-only, entirely: there's no native bridge/module registry on the
  // web build at all (this whole tool only ever existed to chase a
  // TestFlight crash-on-launch with no other way to see the JS error), so
  // requiring NativeExceptionsManager on web throws its own unrelated
  // "__fbBatchedBridgeConfig is not set" error — skip it there instead of
  // surfacing that as if it were a caught fatal error.
  //
  // The console.error/ErrorUtils overrides below used to run unconditionally
  // ("harmless to keep" even on web) — that was wrong. console.error is a
  // completely normal, recoverable logging channel on web (Firestore's SDK
  // uses it to report a snapshot listener hiccup it's already handling
  // internally, for instance — it never throws), and treating every single
  // call as an unrecoverable full-app crash white-screened haven-ly.com for
  // any signed-in family who hit one, with no recovery short of a page
  // reload. Scoping the whole function to native keeps 100% of the original
  // TestFlight diagnostic intact while no longer touching the web build at
  // all.
  if (require('react-native').Platform.OS === 'web') return;

  try {
    const NativeExceptionsManager = require('react-native/Libraries/Core/NativeExceptionsManager').default;
    if (NativeExceptionsManager) {
      NativeExceptionsManager.reportException = (data: any) => {
        capture(`[reportException] ${data?.message ?? '(no message)'}\n\n${stackToText(data?.stack)}`);
      };
      NativeExceptionsManager.reportFatalException = (message: string, stack: unknown) => {
        capture(`[reportFatalException] ${message}\n\n${stackToText(stack)}`);
      };
      NativeExceptionsManager.reportSoftException = (message: string, stack: unknown) => {
        capture(`[reportSoftException] ${message}\n\n${stackToText(stack)}`);
      };
    }
  } catch (err) {
    capture(`[crashDiagnostics] couldn't patch NativeExceptionsManager: ${String(err)}`);
  }

  // Belt-and-suspenders — harmless to keep even though neither of these
  // turned out to be the actual mechanism.
  const globalAny = global as any;
  if (globalAny.ErrorUtils?.setGlobalHandler) {
    globalAny.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      const label = isFatal ? 'FATAL' : 'ERROR';
      capture(`[ErrorUtils] ${label}: ${error?.message ?? String(error)}\n\n${error?.stack ?? '(no stack)'}`);
    });
  }

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    capture(`[console.error] ${args.map(stringifyArg).join(' ')}`);
    originalConsoleError(...args);
  };
}
