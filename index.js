// The actual JS entry point (see package.json's "main") — plain require()
// calls, not import, so execution order is unambiguous: install the fatal-
// error diagnostic display BEFORE anything else in the app (including
// expo-router's own startup, which pulls in the whole app import graph) has
// a chance to run and throw. See lib/crashDiagnostics.ts for why this
// exists and when to remove it.
const { installFatalErrorDisplay } = require('./lib/crashDiagnostics');
installFatalErrorDisplay();

require('expo-router/entry');
