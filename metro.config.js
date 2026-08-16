const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// functions/ (this project's root-level Cloud Functions codebase) is a
// separate Node.js project with its own package.json and server-only
// dependencies (firebase-admin, etc.) — none of it is ever meant to reach
// the client bundle. Metro has no notion of that boundary by default and,
// on an empty/cold cache, can intermittently try to resolve into it
// (surfacing as an unresolvable Node-only import like farmhash-modern's
// .wasm file deep inside firebase-admin). Blocking the directory removes
// it from Metro's module graph entirely rather than relying on nothing
// ever importing it by accident.
//
// Anchored to the absolute repo-root functions/ path specifically —
// matching on the bare substring "functions" would also catch the
// legitimate client-side `firebase/functions` SDK import used throughout
// lib/*.ts, which lives under node_modules/firebase/functions and must
// stay reachable.
const functionsDir = path.join(__dirname, 'functions').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = new RegExp(`^${functionsDir}/.*$`);

module.exports = config;
