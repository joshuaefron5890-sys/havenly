import Head from 'expo-router/head';
import { router } from 'expo-router';
import { FormEvent, MouseEvent, useState } from 'react';
import { ArrowRight, BadgeCheck, Check, CircleDollarSign, Clock3, MapPin, ShieldCheck } from 'lucide-react';
import { isWithinServiceArea } from '../lib/serviceArea';

// Pixel-accurate reproduction of the reference site's own page.tsx +
// globals.css (see /root/.claude/uploads — the site's own exported
// source, provided directly by the user rather than scraped) — this file
// intentionally mirrors that source's structure and copy verbatim rather
// than approximating it with this app's usual component/StyleSheet
// conventions. A .web.tsx sibling of app/providers.tsx: Metro/Expo Router's
// platform-extension resolution serves THIS file for web builds and
// leaves the native app (iOS/Android) on the existing RN implementation,
// since this reproduction only makes sense as real browser CSS (CSS
// grid, clamp(), backdrop-filter, native anchor-scroll) that plain React
// Native has no equivalent for.
const BACKGROUND_OPTIONS = [
  'Registered behavior technician (RBT) or behavior technician',
  'Special education teacher or classroom aide',
  'Paraeducator or inclusion aide',
  'Speech-language pathology, occupational therapy, psychology, or education student',
  'Respite care or adaptive recreation worker',
  'Experienced nanny or caregiver',
  'Sibling or volunteer with experience supporting neurodivergent children and/or children with disabilities',
  'Other relevant experience',
];

const EXPERIENCE_GROUPS = [
  'Behavior technicians, special educators, and classroom or inclusion aides',
  'Students in speech-language pathology, OT, psychology, or education',
  'Respite workers, adaptive recreation staff, nannies, and caregivers',
  'Siblings and volunteers with experience supporting neurodivergent children',
];

const STEPS: [string, string][] = [
  ['Tell us about yourself', 'Share your experience and the children you feel comfortable supporting.'],
  ['Complete the screening process', 'We’ll review your experience, references, identity, and standard safety checks.'],
  ['Find work that fits your life', 'Set your availability and choose opportunities that fit your life.'],
];

// Adapted from the reference's own globals.css, nested under .kp-root via
// native CSS nesting so it's scoped to this page instead of leaking into
// the rest of the app's <body> — everything else (selectors, hex colors,
// spacing, clamp()s, media query breakpoints, cascade/override order) is
// copied over unchanged. A handful of selectors from the source file
// (.why-section, .role-summary, .founder-perks, .microcopy, .person-*,
// .hill-*, .scene-*) are dropped here because the reference's own JSX
// never renders an element for them either — dead CSS in the source with
// nothing to select.
const PAGE_CSS = `
/* The reference's own next/font/google setup serves Geist as a true
   variable font (weight 100-900, not fixed static instances) so that
   arbitrary in-between weights like 550/650/750 below render correctly
   instead of getting faux-bolded or snapped to the nearest loaded
   weight. Self-hosting the same file (downloaded once from Google
   Fonts' own CDN, public/fonts/) rather than a <link> to
   fonts.googleapis.com avoids a runtime dependency on that CDN being
   reachable. */
@font-face {
  font-family: 'Geist';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/Geist-Variable.woff2') format('woff2');
}
/* The headline/heading font-family below leads with the system font
   Georgia (matching the reference exactly), which looks right on the
   platforms that actually ship it (macOS, iOS, Windows) — but plenty
   of Android/Linux browsers don't have Georgia OR "Times New Roman"
   installed at all, silently falling all the way back to a generic
   serif with completely different letter widths, which is what the
   tight -0.045em letter-spacing below was tuned for and reads as
   "wrong spacing/weight" once it's a different face. Tinos is Google's
   own open, metric-compatible substitute for Georgia (same letter
   widths/proportions) — self-hosting it here as a fallback (kept
   AFTER Georgia in the stack, so real Georgia still wins wherever
   it's available) guarantees the same look everywhere instead of
   leaving it to whatever generic serif a given OS happens to have. */
@font-face {
  font-family: 'Tinos';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/Tinos-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'Tinos';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/Tinos-Bold.woff2') format('woff2');
}
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

.kp-root {
  margin: 0;
  background: #faf9f3;
  color: #24382f;
  font-family: 'Geist', Arial, sans-serif;
  /* React Native Web resets <body> to height:100vh + overflow:hidden,
     since RN screens normally bring their own ScrollView instead of
     relying on document scroll — this page has no ScrollView (it's
     real HTML relying on the page itself scrolling), so without this
     the whole page is inert: content renders but the viewport can
     never move. Making .kp-root its own scroll container sidesteps
     that instead of touching the shared, app-wide <body> reset. */
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;

  * { box-sizing: border-box; }
  a { color: inherit; text-decoration: none; }
  button, input, select { font: inherit; }
  h1, h2, h3, p { margin-top: 0; }
  h1, h2 { font-family: Georgia, Tinos, "Times New Roman", serif; font-weight: 500; letter-spacing: -0.045em; }

  .nav-shell { height: 82px; max-width: 1240px; margin: auto; padding: 0 34px; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: inline-flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 750; letter-spacing: -0.02em; }
  .brand-mark { width: 34px; height: 34px; border-radius: 50% 50% 48% 52%; display: grid; place-items: center; color: white; background: #1b6b56; transform: rotate(-4deg); }
  .brand-mark svg { transform: rotate(4deg); }
  .nav-links { display: flex; align-items: center; gap: 30px; color: #52675d; font-size: 14px; font-weight: 550; }
  .nav-links a:hover { color: #1b6b56; }
  .nav-cta { border: 1px solid #1b6b56; color: #1b6b56 !important; padding: 11px 17px; border-radius: 999px; }

  .eyebrow, .kicker { display: inline-flex; align-items: center; gap: 7px; color: #1b6b56; font-size: 12px; font-weight: 750; letter-spacing: 0.11em; text-transform: uppercase; }
  h1 { margin: 20px 0 24px; max-width: 690px; font-size: clamp(58px, 7vw, 92px); line-height: 0.95; }
  h1 em { color: #1b6b56; font-weight: 500; }
  .hero { min-height: 670px; overflow: hidden; max-width: 1240px; margin: auto; padding: 74px 34px 70px; display: grid; grid-template-columns: 1.03fr 0.97fr; gap: 70px; align-items: center; }
  .hero-lede { max-width: 615px; color: #566b61; font-size: 20px; line-height: 1.55; }
  .hero-actions { margin-top: 34px; display: flex; align-items: center; gap: 25px; flex-wrap: wrap; }
  .primary-link { min-height: 52px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 0 23px; border-radius: 999px; background: #1b6b56; color: #fff; font-weight: 700; box-shadow: 0 12px 30px #155d4b25; }
  .primary-link:hover { background: #0e5b4c; transform: translateY(-1px); }
  .secondary-link { padding: 10px 0 7px; border-bottom: 1px solid #aebdb5; color: #41594e; font-size: 14px; font-weight: 650; }

  .hero-visual { position: relative; min-height: 510px; display: grid; place-items: center; }
  .sun-shape { position: absolute; width: 460px; height: 460px; border-radius: 47% 53% 60% 40%; background: #dbe8dd; transform: rotate(-9deg); }
  .portrait-card { position: relative; width: min(390px, 76vw); overflow: hidden; z-index: 1; border: 9px solid #fff; border-radius: 28px; background: #fff; box-shadow: 0 25px 60px #35504529; }
  .portrait-scene { position: relative; height: 350px; overflow: hidden; background: linear-gradient(#b8ddd6 0 58%, #d7e7b0 58%); }
  .portrait-caption { padding: 17px 20px 16px; display: grid; grid-template-columns: 12px 1fr; align-items: center; column-gap: 8px; color: #557066; font-size: 12px; }
  .portrait-caption strong { grid-column: 2; margin-top: 2px; color: #263e34; font-size: 14px; }
  .status-dot { grid-row: 1 / span 2; width: 9px; height: 9px; border-radius: 50%; background: #1b6b56; }
  .float-card { position: absolute; z-index: 2; display: flex; align-items: center; gap: 11px; padding: 13px 16px; border-radius: 16px; background: #fff; box-shadow: 0 16px 40px #284a3c24; }
  .float-card svg { width: 30px; height: 30px; padding: 7px; border-radius: 9px; color: #1b6b56; background: #e8f3ed; }
  .float-card span { display: grid; gap: 2px; }
  .float-card small { color: #70827a; font-size: 10px; }
  .float-card strong { color: #2f453b; font-size: 13px; }
  .float-pay { left: -18px; top: 86px; }
  .float-fit { right: -20px; bottom: 72px; }

  .trust-strip { border-block: 1px solid #e0e7e1; background: #f7faf6; display: grid; grid-template-columns: repeat(4, 1fr); padding: 25px max(34px, calc((100% - 1172px) / 2)); }
  .trust-strip > div { min-height: 45px; display: flex; align-items: center; justify-content: center; gap: 11px; border-right: 1px solid #dce4de; color: #60736a; font-size: 12px; }
  .trust-strip > div:last-child { border-right: 0; }
  .trust-strip svg { width: 22px; color: #1b6b56; }
  .trust-strip span { display: grid; }
  .trust-strip strong { color: #2e453a; font-size: 13px; }

  .split-section { max-width: 1160px; margin: auto; padding: 120px 34px; display: grid; grid-template-columns: 1fr 0.88fr; gap: 100px; align-items: center; }
  .section-intro h2, .center-heading h2, .apply-copy h2 { margin: 17px 0 22px; font-size: clamp(42px, 5vw, 61px); line-height: 1.04; }
  .section-intro > p { max-width: 560px; color: #61756b; font-size: 17px; line-height: 1.7; }
  .not-therapy { margin-top: 32px; max-width: 580px; display: flex; gap: 13px; padding: 18px; border-radius: 15px; background: #edf5ef; color: #536b60; font-size: 13px; line-height: 1.55; }
  .not-therapy svg { flex: none; color: #1b6b56; }
  .not-therapy strong { display: block; color: #2c453a; }
  .experience-card { padding: 36px; border: 1px solid #dbe4de; border-radius: 28px; background: #fff; box-shadow: 0 20px 70px #36544412; }
  .card-label { margin-bottom: 23px; color: #394f44; font-weight: 750; }
  .experience-card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 15px; }
  .experience-card li { display: flex; align-items: center; gap: 11px; color: #53675e; font-size: 14px; }
  .experience-card li svg { width: 21px; height: 21px; padding: 4px; border-radius: 50%; color: #fff; background: #1b6b56; }
  .experience-note { margin: 28px 0 0; padding-top: 22px; border-top: 1px solid #e6ebe7; color: #7a8982; font-size: 12px; line-height: 1.6; }

  .how-section { padding: 105px 34px 120px; background: #eef4ef; }
  .center-heading { max-width: 750px; margin: 0 auto 62px; text-align: center; }
  .steps-grid { max-width: 1090px; margin: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 44px; }
  .steps-grid article { position: relative; padding: 0 20px; }
  .steps-grid article:not(:last-child):after { content: ''; position: absolute; right: -23px; top: 30px; width: 46px; border-top: 1px dashed #aabbaf; }
  .step-number { display: grid; place-items: center; width: 56px; height: 56px; margin-bottom: 23px; border-radius: 50%; background: #fff; color: #1b6b56; font-family: Georgia, Tinos, serif; font-size: 19px; box-shadow: 0 10px 25px #3e5c4e14; }
  .steps-grid h3 { margin-bottom: 10px; font-size: 17px; }
  .steps-grid p { color: #687b72; font-size: 14px; line-height: 1.7; }

  .apply-section { padding: 100px max(34px, calc((100% - 1170px) / 2)); display: grid; grid-template-columns: 1fr 0.82fr; gap: 85px; align-items: center; color: #fff; background: #175746; }
  .kicker.light { color: #dbe8dd; }
  .apply-copy h2 { color: #fff; }
  .apply-copy > p { max-width: 620px; color: #c9ddd5; font-size: 16px; line-height: 1.7; }
  .lead-card { min-height: 535px; padding: 34px; border-radius: 27px; background: #fff; color: #2d4339; box-shadow: 0 30px 80px #0d3e3538; }
  .lead-card form { display: grid; gap: 16px; }
  .lead-card h3 { margin: 7px 0 5px; font-family: Georgia, Tinos, serif; font-size: 29px; font-weight: 500; }
  .lead-card form > div > p { color: #75847d; font-size: 13px; }
  .form-tag { color: #1b6b56; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  .lead-card label { display: grid; gap: 6px; color: #42584e; font-size: 12px; font-weight: 700; }
  .name-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .lead-card input, .lead-card select { width: 100%; height: 43px; padding: 0 12px; border: 1px solid #d4ded8; border-radius: 10px; background: #fbfdfb; color: #294037; outline: none; }
  .lead-card input:focus, .lead-card select:focus { border-color: #70aa98; box-shadow: 0 0 0 3px #6ba79120; }
  .submit-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; cursor: pointer; height: 48px; margin-top: 4px; border-radius: 999px; background: #1b6b56; color: #fff; font-size: 14px; font-weight: 750; }
  .submit-button:hover { background: #124f3f; }
  .submit-button:disabled { opacity: 0.65; cursor: default; }
  .privacy-note { margin: -5px 0 0; color: #8a9690; font-size: 10px; text-align: center; }
  .field-error { margin: -6px 0 0; color: #b3261e; font-size: 11.5px; text-align: center; }
  .success-state { min-height: 465px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .success-icon { width: 64px; height: 64px; margin-bottom: 24px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #1b6b56; }
  .success-state h3 { font-size: 31px; }
  .success-state p { max-width: 340px; color: #708078; line-height: 1.6; }

  footer { min-height: 150px; padding: 48px max(34px, calc((100% - 1170px) / 2)); display: grid; grid-template-columns: 1fr 1.5fr 1fr; align-items: center; gap: 30px; background: #faf9f3; color: #718078; font-size: 12px; }
  footer p { margin: 0; text-align: center; }
  footer > span { text-align: right; }

  @media (max-width: 900px) {
    .nav-links a:not(.nav-cta) { display: none; }
    .hero { padding-top: 45px; grid-template-columns: 1fr; gap: 35px; }
    .hero-copy { text-align: center; }
    .eyebrow, .hero-actions { justify-content: center; }
    .hero-lede { margin-inline: auto; }
    .hero-visual { min-height: 490px; }
    .trust-strip { grid-template-columns: 1fr 1fr; }
    .trust-strip > div { border-bottom: 1px solid #dce4de; }
    .split-section, .apply-section { grid-template-columns: 1fr; gap: 55px; }
    .steps-grid { gap: 15px; }
    .steps-grid article { padding: 0 8px; }
    footer { grid-template-columns: 1fr; text-align: center; }
    footer p, footer > span { text-align: center; }
  }

  @media (max-width: 620px) {
    .nav-shell { height: 70px; padding: 0 20px; }
    .nav-cta { padding: 9px 12px; font-size: 11px; }
    .hero { min-height: auto; padding: 48px 20px 55px; }
    h1 { font-size: 55px; }
    .hero-lede { font-size: 17px; }
    .hero-actions { flex-direction: column; gap: 12px; }
    .hero-visual { min-height: 420px; }
    .sun-shape { width: 350px; height: 350px; }
    .portrait-card { width: 285px; border-width: 7px; }
    .portrait-scene { height: 285px; }
    .float-pay { top: 40px; left: -4px; }
    .float-fit { right: -4px; bottom: 28px; }
    .trust-strip { grid-template-columns: 1fr; padding: 10px 24px; }
    .trust-strip > div { justify-content: flex-start; padding: 13px 6px; border-right: 0; }
    .section-intro h2, .center-heading h2, .apply-copy h2 { font-size: 42px; }
    .split-section { padding: 85px 20px; }
    .experience-card { padding: 26px 22px; }
    .how-section { padding: 80px 20px; }
    .steps-grid { grid-template-columns: 1fr; gap: 35px; }
    .steps-grid article { display: grid; grid-template-columns: 55px 1fr; column-gap: 16px; }
    .steps-grid article:after { display: none; }
    .steps-grid h3 { align-self: center; }
    .steps-grid p { grid-column: 2; }
    .apply-section { padding: 80px 20px; }
    .lead-card { padding: 27px 22px; }
  }

  /* Opened Circle brand: forest green, warm cream, and the supplied circle mark. */
  .brand { font-size: 20px; letter-spacing: -0.045em; white-space: nowrap; color: #1b6b56; }
  .brand-mark { width: 40px; height: 40px; display: block; object-fit: contain; border-radius: 50%; background: none; transform: none; }
  h1 em { font-style: normal; }
  .hero-visual .sun-shape { background: #e4ece1; border-radius: 50%; transform: none; }
  .portrait-scene { background: #e4ece1; display: grid; place-items: center; }
  .portrait-scene img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
  .portrait-caption { padding: 18px 15px; line-height: 1.6; }
  .portrait-caption strong { font-size: 12px; }
  .example-label { display: block; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #687c72; }
  .experience-card li { align-items: flex-start; line-height: 1.55; }
  .experience-card li svg { flex: none; margin-top: 2px; }
  .experience-note { color: #61756b; }
  .privacy-note { color: #61756b; line-height: 1.5; }
  section[id] { scroll-margin-top: 30px; }
  a:focus-visible, button:focus-visible { outline: 3px solid #7baa99; outline-offset: 5px; }

  @media (max-width: 620px) {
    .brand { font-size: 17px; gap: 7px; }
    .brand-mark { width: 33px; height: 33px; }
    .nav-links { gap: 0; }
    .nav-cta { max-width: 145px; text-align: center; }
    .portrait-caption strong { font-size: 10px; }
    .hero-visual .sun-shape { width: min(350px, 100%); height: auto; aspect-ratio: 1; }
    .float-fit { right: 0; }
    .float-pay { left: 0; }
  }

  /* A shorter path from the opportunity to the founding-provider invitation. */
  .trust-strip { grid-template-columns: repeat(3, 1fr); padding-block: 18px; }
  .split-section { padding-block: 72px; gap: 64px; }
  .section-intro h2, .center-heading h2 { font-size: clamp(36px, 4vw, 48px); }
  .not-therapy { margin-top: 22px; }
  .experience-card { padding: 28px; }
  .experience-card ul { gap: 12px; }
  .experience-note { margin-top: 20px; padding-top: 16px; }
  .how-section { padding-block: 64px; }
  .center-heading { margin-bottom: 32px; }
  .step-number { margin-bottom: 16px; }
  .steps-grid p { margin-bottom: 0; }
  .apply-section { padding-block: 72px; }
  @media (max-width: 900px) { .split-section { gap: 32px; } .apply-section { gap: 36px; } }
  @media (max-width: 620px) {
    .split-section, .how-section, .apply-section { padding-block: 48px; }
    .trust-strip { grid-template-columns: 1fr; padding-block: 8px; }
    .trust-strip > div { padding-block: 10px; }
    .trust-strip > div:last-child { border-bottom: 0; }
    .steps-grid { gap: 22px; }
    .step-number { margin-bottom: 0; }
    .steps-grid h3 { margin-bottom: 8px; }
    .steps-grid p { margin-top: 4px; }
    .experience-card { padding: 24px 22px; }
  }

  /* Keep signup available at every scroll position without covering the form. */
  .nav-shell { position: sticky; top: 0; z-index: 50; background: #faf9f3f5; backdrop-filter: blur(12px); box-shadow: 0 1px 0 #dce6df; }
  .nav-cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #1b6b56; color: #fff !important; min-height: 44px; padding-inline: 20px; }
  .nav-cta:hover { background: #175746; }
  section[id], #interest-form { scroll-margin-top: 104px; }
  @media (max-width: 620px) {
    section[id], #interest-form { scroll-margin-top: 90px; }
    .nav-cta { font-size: 13px; padding-inline: 17px; }
  }

  /* Out-of-service-area notice — not part of the reference (which has no
     eligibility concept), styled with the page's own tokens so it reads
     as native to the design instead of a bolted-on app dialog. */
  .oc-modal-scrim { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(23, 87, 70, 0.45); }
  .oc-modal-card { width: 100%; max-width: 360px; padding: 32px 28px; border-radius: 27px; background: #fff; color: #2d4339; box-shadow: 0 30px 80px #0d3e3538; text-align: center; }
  .oc-modal-icon { width: 56px; height: 56px; margin: 0 auto 20px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #1b6b56; }
  .oc-modal-card p { color: #536b60; font-size: 14.5px; line-height: 1.6; margin-bottom: 22px; }
  .oc-modal-button { display: inline-flex; align-items: center; justify-content: center; border: 0; cursor: pointer; height: 44px; padding: 0 26px; border-radius: 999px; background: #1b6b56; color: #fff; font-size: 14px; font-weight: 750; }
  .oc-modal-button:hover { background: #124f3f; }
}
`;

export default function SittersLanding() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [zip, setZip] = useState('');
  const [background, setBackground] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [outOfAreaOpen, setOutOfAreaOpen] = useState(false);

  // Preserves this page's real working behavior (ZIP-radius gating, then
  // handing the name/zip to the provider-signup flow as route params) while
  // restoring the reference's own field set and copy — see PAGE_CSS's
  // doc comment above for why this differs structurally from the
  // reference's local-only demo `setSubmitted(true)`.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setZipError(null);
    setSubmitting(true);
    const eligible = await isWithinServiceArea(zip.trim());
    if (eligible === null) {
      setSubmitting(false);
      setZipError('Couldn’t verify that zip code — double check it and try again.');
      return;
    }
    if (!eligible) {
      setSubmitting(false);
      setOutOfAreaOpen(true);
      return;
    }
    setSubmitted(true);
    setTimeout(() => {
      const name = `${firstName.trim()} ${lastName.trim()}`.trim();
      router.push({ pathname: '/provider-signup', params: { name, zip: zip.trim() } });
    }, 900);
  }

  // The brand mark/wordmark (nav and footer) — real href="/" so
  // middle-click/right-click "open in new tab" still works, but a plain
  // left-click goes through expo-router instead of a full page reload,
  // matching how the rest of this app navigates between routes.
  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    router.push('/');
  }
  function goSignIn(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    router.push('/sign-in');
  }

  return (
    <div className="kp-root">
      <Head>
        <style>{PAGE_CSS}</style>
      </Head>

      <main>
        <nav className="nav-shell" aria-label="Main navigation">
          <a href="/" className="brand" aria-label="Opened Circle home" onClick={goHome}>
            <img className="brand-mark" src="/opened-circle-logo.png" alt="" width={40} height={40} />
            <span>Opened Circle</span>
          </a>
          <div className="nav-links">
            <a href="/" onClick={goHome}>
              For parents
            </a>
            <a href="#top">For providers</a>
            <a href="/sign-in" onClick={goSignIn}>
              Login
            </a>
            <a href="#interest-form" className="nav-cta">
              Join Early Access <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </nav>

        <section id="top" className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <MapPin size={14} /> Now forming in the Bay Area
            </div>
            <h1>
              Help kids connect. <em>Get the pay you deserve.</em>
            </h1>
            <p className="hero-lede">
              Opened Circle matches experienced care providers with neurodivergent families to support structured
              playdates.
            </p>
            <div className="hero-actions">
              <a href="#interest-form" className="primary-link">
                Apply Now <ArrowRight size={18} />
              </a>
              <a href="#role" className="secondary-link">
                See what the role involves
              </a>
            </div>
          </div>
          <div className="hero-visual" aria-label="A snapshot of a flexible provider opportunity">
            <div className="sun-shape" />
            <div className="portrait-card">
              <div className="portrait-scene">
                <img
                  src="/playdate-modern.png"
                  alt="AI-generated scene of a provider playing with two children, one wearing headphones, while parents talk nearby."
                  width={1024}
                  height={1024}
                  fetchPriority="high"
                />
              </div>
              <div className="portrait-caption">
                <span className="status-dot" />
                <span>
                  <small className="example-label">Example opportunity</small>
                  Saturday playdate support
                </span>
                <strong>Hillsborough – Vista Park · 10am–12:00pm</strong>
              </div>
            </div>
            <div className="float-card float-pay">
              <CircleDollarSign />
              <span>
                <small>You set your rate</small>
                <strong>$30–$45+ / hour</strong>
              </span>
            </div>
            <div className="float-card float-fit">
              <BadgeCheck />
              <span>
                <small>A family match</small>
                <strong>Based on your experience</strong>
              </span>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Opportunity highlights">
          <div>
            <Clock3 />
            <span>
              <strong>Flexible</strong> evenings & weekends
            </span>
          </div>
          <div>
            <MapPin />
            <span>
              <strong>Local</strong> Peninsula families
            </span>
          </div>
          <div>
            <CircleDollarSign />
            <span>
              <strong>100%</strong> of your hourly rate
            </span>
          </div>
        </section>

        <section id="role" className="split-section">
          <div className="section-intro">
            <span className="kicker">A different kind of support</span>
            <h2>Help children feel at ease.</h2>
            <p>
              Opened Circle connects families of neurodivergent children for playdates and matches them with
              providers like you to come along. You’ll help children feel comfortable joining in while parents get
              to know one another.
            </p>
            <div className="not-therapy">
              <ShieldCheck />
              <span>
                <strong>This isn’t a clinical role.</strong> You’ll support play and participation—not deliver
                therapy or follow a treatment plan.
              </span>
            </div>
          </div>
          <div className="experience-card">
            <p className="card-label">Experience comes in many forms.</p>
            <ul>
              {EXPERIENCE_GROUPS.map((item) => (
                <li key={item}>
                  <Check size={16} />
                  {item}
                </li>
              ))}
            </ul>
            <p className="experience-note">
              Professional training and lived experience both count. We value good judgement, warmth, and a genuine
              connection with kids.
            </p>
          </div>
        </section>

        <section id="how" className="how-section">
          <div className="center-heading">
            <span className="kicker">How it works</span>
            <h2>Three steps to get started.</h2>
          </div>
          <div className="steps-grid">
            {STEPS.map(([title, text], index) => (
              <article key={title}>
                <span className="step-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="apply" className="apply-section">
          <div className="apply-copy">
            <span className="kicker light">Founding provider network</span>
            <h2>Help us build the village families have been looking for.</h2>
            <p>Join our first providers in and around Hillsborough and help shape what comes next.</p>
          </div>
          <div id="interest-form" className="lead-card" tabIndex={-1}>
            {submitted ? (
              <div className="success-state" role="status">
                <span className="success-icon">
                  <Check />
                </span>
                <h3>You’re on the founding list.</h3>
                <p>Thanks for raising your hand. We’re taking you to the provider application.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div>
                  <span className="form-tag">Takes about 1 minute</span>
                  <h3>Join the interest list</h3>
                  <p>We’ll send you the full application and launch details.</p>
                </div>
                <div className="name-row">
                  <label>
                    First name
                    <input
                      name="firstName"
                      required
                      autoComplete="given-name"
                      placeholder="Jamie"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      name="lastName"
                      required
                      autoComplete="family-name"
                      placeholder="Chen"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  ZIP code
                  <input
                    name="zip"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{5}"
                    placeholder="94010"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                  />
                </label>
                <label>
                  Your background
                  <select
                    name="background"
                    required
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                  >
                    <option value="" disabled>
                      Select the closest fit
                    </option>
                    {BACKGROUND_OPTIONS.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                {zipError ? <p className="field-error">{zipError}</p> : null}
                <button type="submit" className="submit-button" disabled={submitting}>
                  {submitting ? 'Checking…' : 'I’m interested'} {submitting ? null : <ArrowRight />}
                </button>
                <p className="privacy-note">We’ll only use your information to contact you about the provider network.</p>
              </form>
            )}
          </div>
        </section>

        <footer>
          <a href="/" className="brand" onClick={goHome}>
            <img className="brand-mark" src="/opened-circle-logo.png" alt="" width={40} height={40} />
            <span>Opened Circle</span>
          </a>
          <p>Belonging, shaped differently.</p>
          <span>Launching in Hillsborough, California</span>
        </footer>
      </main>

      {outOfAreaOpen ? (
        <div className="oc-modal-scrim" onClick={() => setOutOfAreaOpen(false)}>
          <div className="oc-modal-card" onClick={(e) => e.stopPropagation()}>
            <span className="oc-modal-icon">
              <MapPin />
            </span>
            <p>
              We are currently only available in the Bay Area Peninsula, but will soon be coming to a location near
              you
            </p>
            <button type="button" className="oc-modal-button" onClick={() => setOutOfAreaOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
