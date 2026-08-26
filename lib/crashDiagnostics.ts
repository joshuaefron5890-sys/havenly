// TEMPORARY diagnostic tool — TestFlight builds have been hard-crashing on
// launch with no visible JS error message: Apple's own crash reports only
// show native symbol offsets/queue names, never the original JS error or
// its stack, and getting a live console log off a real device turned out
// to need tooling (Console.app device access, a working local Xcode/
// CocoaPods toolchain) that wasn't readily available.
//
// Two independent interception points, since it wasn't obvious up front
// which one actually catches this crash:
//
// 1. global.ErrorUtils's registered handler — React Native's DEFAULT
//    implementation reports an uncaught JS error to native
//    (RCTExceptionsManager) and lets it crash so there's a native crash
//    report. Installing our own handler runs INSTEAD of that default one.
//
// 2. console.error itself — React Native's console polyfill can ALSO
//    route console.error calls straight to that same native reporting
//    path in production (treating them as fatal), entirely separately
//    from global.ErrorUtils. Every crash log so far shows the same
//    RCTExceptionsManager reportFatal/reportException signature even
//    with (1) installed first, which is why this exists too — capturing
//    here, before forwarding to the original console.error, stops RN's
//    own wrapper from ever running.
//
// Both installed from index.js — the actual JS entry point (package.json's
// "main") — rather than from app/_layout.tsx, since a module-load-time
// error/console.error call anywhere earlier in the import graph (e.g.
// lib/firebase.ts's eager initializeApp/createAuth calls, pulled in
// transitively the moment _layout.tsx imports AuthProvider) would already
// have happened before _layout.tsx's own top-level code ever ran. State
// lives here, as a shared module singleton, so index.js (which installs
// it) and _layout.tsx (which displays it) see the same value regardless
// of which mechanism actually caught something.
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

export function installFatalErrorDisplay(): void {
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
