// UI-gating only — decides whether to show the compose bar on the
// Community thread. The actual write is protected server-side by
// firestore.rules' matching literal (Firestore rules can't import a JS
// constant, so that list is duplicated there, and again in
// functions/index.js's SUPER_ADMIN_EMAILS for the notification fan-out —
// all three need to stay in sync when this list changes).
export const SUPER_ADMIN_EMAILS = ['joshuaefron5890@gmail.com'];

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && SUPER_ADMIN_EMAILS.includes(email));
}
