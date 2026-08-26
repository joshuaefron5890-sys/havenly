// TEMPORARY diagnostic tool — TestFlight builds have been hard-crashing on
// launch with no visible JS error message: Apple's own crash reports only
// show native symbol offsets/queue names, never the original JS error or
// its stack, and getting a live console log off a real device turned out
// to need tooling (Console.app device access, a working local Xcode/
// CocoaPods toolchain) that wasn't readily available.
//
// React Native's own crash-on-fatal-JS-error behavior works by calling
// global.ErrorUtils's registered handler, whose DEFAULT implementation
// reports the error to the native side (RCTExceptionsManager) and lets it
// crash so there's a native crash report — that's exactly the call chain
// visible in every crash log so far (RCTExceptionsManager reportFatal/
// reportException). Installing our own handler here runs INSTEAD of that
// default one, so the same fatal error renders as plain on-screen text
// (see app/_layout.tsx) instead of taking the app down.
//
// installFatalErrorDisplay() is called from index.js — the actual JS entry
// point (package.json's "main") — rather than from app/_layout.tsx, since
// a module-load-time error anywhere earlier in the import graph (e.g.
// lib/firebase.ts's eager initializeApp/createAuth calls, pulled in
// transitively the moment _layout.tsx imports AuthProvider) would already
// have happened before _layout.tsx's own top-level code ever ran. State
// lives here, as a shared module singleton, so index.js (which installs
// it) and _layout.tsx (which displays it) see the same value regardless
// of which one actually caught the error.
//
// Remove installFatalErrorDisplay(), its call site in index.js, and the
// error-screen branch in app/_layout.tsx once the real bug behind this is
// found and fixed — this is a one-time diagnostic aid, not a permanent
// replacement for letting a genuine fatal error crash.
type Listener = (text: string) => void;

let fatalErrorText: string | null = null;
let listener: Listener | null = null;

export function getFatalErrorText(): string | null {
  return fatalErrorText;
}

export function subscribeFatalError(fn: Listener | null): void {
  listener = fn;
}

export function installFatalErrorDisplay(): void {
  const globalAny = global as any;
  if (!globalAny.ErrorUtils?.setGlobalHandler) return;
  globalAny.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    const label = isFatal ? 'FATAL' : 'ERROR';
    const message = error?.message ?? String(error);
    const stack = error?.stack ?? '(no stack available)';
    fatalErrorText = `${label}: ${message}\n\n${stack}`;
    listener?.(fatalErrorText);
  });
}
