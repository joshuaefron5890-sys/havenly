import Head from 'expo-router/head';
import { router, useFocusEffect } from 'expo-router';
import { MouseEvent, useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ArrowRight, Calendar, Check, MapPin, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { routeSignedInUser } from '../lib/onboardingProgress';
import { SITTERS_ENABLED } from '../lib/sitters';

// The family-facing home page, redesigned to share app/providers.web.tsx's
// design system (same self-hosted Geist/Tinos fonts, same green/cream
// palette, same nav-shell/hero/card patterns) rather than this app's usual
// component/StyleSheet conventions — see that file's own doc comment for
// why a page like this is built as real HTML/CSS instead. A .web.tsx
// sibling of app/index.tsx: Metro/Expo Router serves this file on web and
// leaves the native app on the existing RN implementation.
const STEPS: [string, string][] = [
  ['The Right Family', 'We pair you with nearby families who share similar needs, ages, and dynamics.'],
  ['The Right Setting', 'We hand-pick locations where your child can feel comfortable, safe, and free to be themselves.'],
  ['The Right Support', 'We provide qualified care providers so both kids and parents have the backup they need.'],
];

const PAGE_CSS = `
@font-face {
  font-family: 'Geist';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/Geist-Variable.woff2') format('woff2');
}
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
  /* Same fix as app/providers.web.tsx: RN Web resets <body> to
     height:100vh + overflow:hidden, expecting a ScrollView to handle
     scrolling instead — this page has none, so .kp-root is its own
     scroll container. */
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;

  * { box-sizing: border-box; }
  a { color: inherit; text-decoration: none; }
  button { font: inherit; }
  h1, h2, h3, p { margin-top: 0; }
  h1, h2 { font-family: Georgia, Tinos, "Times New Roman", serif; font-weight: 500; letter-spacing: -0.045em; }

  .nav-shell { position: sticky; top: 0; z-index: 50; height: 82px; max-width: 1240px; margin: auto; padding: 0 34px; display: flex; align-items: center; justify-content: space-between; background: #faf9f3f5; backdrop-filter: blur(12px); box-shadow: 0 1px 0 #dce6df; }
  .brand { display: inline-flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 750; letter-spacing: -0.045em; white-space: nowrap; color: #1b6b56; }
  .brand-mark { width: 40px; height: 40px; display: block; object-fit: contain; border-radius: 50%; }
  .nav-links { display: flex; align-items: center; gap: 30px; color: #52675d; font-size: 14px; font-weight: 550; }
  .nav-links a:hover, .nav-links button:hover { color: #1b6b56; }
  .nav-current { color: #1b6b56; text-decoration: underline; text-underline-offset: 4px; }
  .nav-cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; cursor: pointer; background: #1b6b56; color: #fff !important; min-height: 44px; padding-inline: 20px; border-radius: 999px; }
  .nav-cta:hover { background: #175746; }

  .eyebrow, .kicker { display: inline-flex; align-items: center; gap: 7px; color: #1b6b56; font-size: 12px; font-weight: 750; letter-spacing: 0.11em; text-transform: uppercase; }
  h1 { margin: 20px 0 20px; max-width: 690px; font-size: clamp(48px, 6vw, 80px); line-height: 0.98; }
  h1 em { color: #1b6b56; font-weight: 500; font-style: normal; }
  .hero { max-width: 1240px; margin: auto; padding: 74px 34px 70px; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 60px; align-items: center; }
  .hero-lede { max-width: 560px; color: #566b61; font-size: 18px; line-height: 1.6; }
  .hero-actions { margin-top: 30px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
  .primary-link { min-height: 52px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border: 0; cursor: pointer; padding: 0 26px; border-radius: 999px; background: #1b6b56; color: #fff; font-size: 15px; font-weight: 700; box-shadow: 0 12px 30px #155d4b25; }
  .primary-link:hover { background: #0e5b4c; transform: translateY(-1px); }
  .secondary-link { border: 0; background: none; cursor: pointer; padding: 10px 0 7px; border-bottom: 1px solid #aebdb5; color: #41594e; font-size: 14px; font-weight: 650; }

  .hero-visual { position: relative; min-height: 420px; display: grid; place-items: center; }
  .sun-shape { position: absolute; width: 420px; height: 420px; border-radius: 50%; background: #e4ece1; }
  .match-visual { position: relative; z-index: 1; width: 380px; height: 350px; }
  .match-pair { position: relative; width: 370px; height: 220px; }
  .match-avatar { position: absolute; top: 0; width: 220px; height: 220px; border-radius: 50%; overflow: hidden; border: 5px solid #faf9f3; background: #e4ece1; box-shadow: 0 18px 40px #35504530; }
  .match-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
  .match-avatar-back { left: 0; }
  .match-avatar-front { left: 150px; z-index: 2; }
  .match-provider { position: absolute; left: 147px; top: 172px; width: 76px; height: 76px; border-radius: 50%; overflow: hidden; border: 4px solid #faf9f3; background: #e4ece1; box-shadow: 0 10px 24px #2c3f3745; z-index: 3; }
  .match-provider img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
  .match-provider-badge { position: absolute; right: -4px; bottom: -4px; width: 26px; height: 26px; border-radius: 50%; background: #1b6b56; border: 2px solid #faf9f3; display: grid; place-items: center; color: #fff; }
  .match-provider-badge svg { width: 13px; height: 13px; }
  .match-card { position: absolute; left: 6px; top: 272px; display: inline-flex; align-items: flex-start; gap: 12px; }
  .match-card-icon { flex: none; width: 26px; height: 26px; border-radius: 50%; background: #1b6b56; display: grid; place-items: center; color: #fff; box-shadow: 0 8px 18px #1b6b5645; }
  .match-card-icon svg { width: 15px; height: 15px; }
  .match-card-text { display: flex; flex-direction: column; gap: 4px; padding-top: 2px; }
  .match-card-text strong { font-size: 15px; color: #24382f; font-weight: 750; }
  .match-card-line { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: #566b61; }
  .match-card-line svg { flex: none; color: #1b6b56; }

  .center-heading { max-width: 720px; margin: 0 auto 24px; text-align: center; }
  .center-heading h2 { margin: 17px 0 0; font-size: clamp(36px, 4.5vw, 54px); line-height: 1.06; }
  .split-section { max-width: 1160px; margin: auto; padding: 72px 34px; display: grid; grid-template-columns: 1fr .88fr; gap: 64px; align-items: center; }
  .section-intro h2 { margin: 17px 0 22px; font-size: clamp(36px, 4.5vw, 54px); line-height: 1.06; }
  .section-intro > p { max-width: 560px; color: #61756b; font-size: 17px; line-height: 1.7; }
  .experience-card { padding: 28px; border: 1px solid #dbe4de; border-radius: 28px; background: #fff; box-shadow: 0 20px 70px #36544412; }
  .card-label { margin-bottom: 23px; color: #394f44; font-weight: 750; }
  .experience-card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .experience-card li { display: flex; align-items: flex-start; gap: 11px; color: #53675e; font-size: 14px; line-height: 1.55; }
  .experience-card li svg { width: 21px; height: 21px; padding: 4px; border-radius: 50%; color: #fff; background: #1b6b56; flex: none; margin-top: 2px; }
  .experience-note { margin: 20px 0 0; padding-top: 16px; border-top: 1px solid #e6ebe7; color: #61756b; font-size: 12px; line-height: 1.6; }

  .how-section { padding: 96px 34px 110px; background: #eef4ef; }
  .steps-grid { max-width: 1090px; margin: 40px auto 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 44px; }
  .steps-grid article { position: relative; padding: 0 20px; }
  .steps-grid article:not(:last-child):after { content: ''; position: absolute; right: -23px; top: 30px; width: 46px; border-top: 1px dashed #aabbaf; }
  .step-number { display: grid; place-items: center; width: 56px; height: 56px; margin-bottom: 18px; border-radius: 50%; background: #fff; color: #1b6b56; font-family: Georgia, Tinos, serif; font-size: 19px; box-shadow: 0 10px 25px #3e5c4e14; }
  .steps-grid h3 { margin-bottom: 8px; font-size: 17px; color: #24382f; }
  .steps-grid p { color: #687b72; font-size: 14px; line-height: 1.7; }
  .how-closing { max-width: 480px; margin: 52px auto 0; text-align: center; font-family: Georgia, Tinos, serif; font-size: 21px; color: #24382f; }
  .how-cta { margin-top: 24px; display: flex; justify-content: center; }

  .vision-section { padding: 110px 34px; text-align: center; color: #fff; background: #175746; }
  .vision-section h2 { max-width: 640px; margin: 0 auto 22px; font-size: clamp(36px, 4.5vw, 54px); line-height: 1.06; color: #fff; }
  .vision-section p { max-width: 560px; margin: auto; color: #c9ddd5; font-size: 17px; line-height: 1.75; }

  footer { min-height: 150px; padding: 48px max(34px, calc((100% - 1170px) / 2)); display: grid; grid-template-columns: 1fr 1.5fr 1fr; align-items: center; gap: 30px; background: #faf9f3; color: #718078; font-size: 12px; }
  footer p { margin: 0; text-align: center; }
  footer > button { justify-self: end; border: 0; background: none; cursor: pointer; color: #718078; font-size: 12px; font: inherit; }
  footer > button:hover { color: #1b6b56; }

  section[id] { scroll-margin-top: 104px; }

  @media (max-width: 900px) {
    .nav-links a:not(.nav-cta) { display: none; }
    .hero { grid-template-columns: 1fr; gap: 40px; padding-top: 50px; text-align: center; }
    .hero-lede { margin-inline: auto; }
    .hero-actions { justify-content: center; }
    .split-section { grid-template-columns: 1fr; gap: 32px; }
    .steps-grid { gap: 20px; }
    .steps-grid article { padding: 0 8px; }
    footer { grid-template-columns: 1fr; text-align: center; }
    footer p, footer > button { text-align: center; justify-self: center; }
  }

  @media (max-width: 620px) {
    .nav-shell { height: 70px; padding: 0 20px; }
    .nav-cta { padding-inline: 17px; font-size: 13px; }
    .brand { font-size: 17px; gap: 7px; }
    .brand-mark { width: 33px; height: 33px; }
    .nav-links { gap: 0; }
    .hero { padding: 44px 20px 50px; }
    h1 { font-size: 42px; }
    .hero-lede { font-size: 16px; }
    .hero-actions { flex-direction: column; align-items: stretch; gap: 12px; }
    .hero-visual { min-height: 300px; }
    .sun-shape { width: 300px; height: 300px; }
    .match-visual { width: 260px; height: 240px; }
    .match-pair { width: 252px; height: 150px; }
    .match-avatar { width: 150px; height: 150px; border-width: 4px; }
    .match-avatar-front { left: 102px; }
    .match-provider { left: 100px; top: 117px; width: 52px; height: 52px; border-width: 3px; }
    .match-provider-badge { width: 18px; height: 18px; }
    .match-provider-badge svg { width: 10px; height: 10px; }
    .match-card { top: 186px; gap: 9px; }
    .match-card-icon { width: 22px; height: 22px; }
    .match-card-icon svg { width: 12px; height: 12px; }
    .match-card-text { gap: 3px; }
    .match-card-text strong { font-size: 13px; }
    .match-card-line { font-size: 11px; gap: 4px; }
    .match-card-line svg { width: 11px; height: 11px; }
    .split-section { padding: 48px 20px; }
    .experience-card { padding: 24px 22px; }
    .center-heading h2, .section-intro h2 { font-size: 34px; }
    .how-section { padding: 60px 20px 70px; }
    .steps-grid { grid-template-columns: 1fr; gap: 30px; }
    .steps-grid article { display: grid; grid-template-columns: 55px 1fr; column-gap: 16px; }
    .steps-grid article:after { display: none; }
    .steps-grid h3 { align-self: center; }
    .steps-grid p { grid-column: 2; }
    .vision-section { padding: 64px 20px; }
    section[id] { scroll-margin-top: 90px; }
  }

  a:focus-visible, button:focus-visible { outline: 3px solid #7baa99; outline-offset: 5px; }
}
`;

export default function Landing() {
  const { user, loading } = useAuth();
  const { updateProfile } = useOnboarding();

  // Identical to the native version's own gate — see app/index.tsx's doc
  // comment on why this is useFocusEffect, not a plain useEffect.
  useFocusEffect(
    useCallback(() => {
      if (loading || !user) return;
      routeSignedInUser(user, updateProfile);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, user])
  );

  function goSignup(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    router.push('/onboarding/account');
  }
  function goSignIn(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    router.push('/sign-in');
  }
  function goProviders(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    router.push('/providers');
  }
  function goPrivacy() {
    router.push('/privacy');
  }

  if (loading || user) {
    return (
      <View style={{ flex: 1, minHeight: '100vh' as any, backgroundColor: '#faf9f3', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#1b6b56" />
      </View>
    );
  }

  return (
    <div className="kp-root">
      <Head>
        <style>{PAGE_CSS}</style>
      </Head>

      <main>
        <nav className="nav-shell" aria-label="Main navigation">
          <a href="#top" className="brand" aria-label="Opened Circle home">
            <img className="brand-mark" src="/opened-circle-logo.png" alt="" width={40} height={40} />
            <span>Opened Circle</span>
          </a>
          <div className="nav-links">
            <a href="#top" className="nav-current">
              For parents
            </a>
            <a href="/providers" onClick={goProviders}>
              For providers
            </a>
            <a href="/sign-in" onClick={goSignIn}>
              Login
            </a>
            <a href="/onboarding/account" className="nav-cta" onClick={goSignup}>
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
              Playdates designed around <em>your child’s needs.</em>
            </h1>
            <p className="hero-lede">
              Opened Circle handles every detail — matching you with compatible families, sensory-friendly places,
              and supportive providers.
            </p>
            <div className="hero-actions">
              <a href="/onboarding/account" className="primary-link" onClick={goSignup}>
                Join Early Access <ArrowRight size={18} />
              </a>
            </div>
          </div>
          <div className="hero-visual" aria-label="Two families matched by Opened Circle, with their playdate provider">
            <div className="sun-shape" />
            <div className="match-visual">
              <div className="match-pair">
                <div className="match-avatar match-avatar-back">
                  <img
                    src="https://images.unsplash.com/photo-1588979355313-6711a095465f?q=80&w=972&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                    alt="The Smith family"
                    width={220}
                    height={220}
                    fetchPriority="high"
                  />
                </div>
                <div className="match-avatar match-avatar-front">
                  <img
                    src="https://plus.unsplash.com/premium_photo-1661475916373-5aaaeb4a5393?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                    alt="The Reese family"
                    width={220}
                    height={220}
                    fetchPriority="high"
                  />
                </div>
                <div className="match-provider">
                  <img
                    src="https://images.unsplash.com/photo-1553514029-1318c9127859?q=80&w=1064&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                    alt="Monica, the matched playdate provider"
                    width={76}
                    height={76}
                  />
                  <span className="match-provider-badge">
                    <ShieldCheck size={13} aria-hidden="true" />
                  </span>
                </div>
              </div>
              <div className="match-card">
                <span className="match-card-icon">
                  <Check size={15} aria-hidden="true" />
                </span>
                <div className="match-card-text">
                  <strong>Matched</strong>
                  <span className="match-card-line">
                    <Calendar size={12} aria-hidden="true" />
                    This Saturday
                  </span>
                  <span className="match-card-line">
                    <MapPin size={12} aria-hidden="true" />
                    Golden Gate Park
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="approach" className="split-section">
          <div className="section-intro">
            <span className="kicker">Our approach</span>
            <h2>Connection shouldn’t take this much work.</h2>
            <p>
              A simple “let’s get the kids together” usually means vetting a venue for sensory triggers, explaining
              your child’s needs to someone new, and managing a high-stress event completely on your own.
            </p>
          </div>
          <div className="experience-card">
            <p className="card-label">Here’s what we handle.</p>
            <ul>
              <li>
                <Check size={16} />
                The right match
              </li>
              <li>
                <Check size={16} />A setting that actually fits
              </li>
              <li>
                <Check size={16} />
                An experienced provider
              </li>
            </ul>
            <p className="experience-note">
              So you can enjoy a break, too, while your child is completely supported.
            </p>
          </div>
        </section>

        <section id="how" className="how-section">
          <div className="center-heading">
            <span className="kicker">How it works</span>
            <h2>How Opened Circle works.</h2>
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
          <p className="how-closing">All you have to do is say yes.</p>
          <div className="how-cta">
            <a href="/onboarding/account" className="primary-link" onClick={goSignup}>
              Join Early Access <ArrowRight size={18} />
            </a>
          </div>
          {SITTERS_ENABLED ? (
            <div className="how-cta" style={{ marginTop: 14 }}>
              <a href="/providers" className="secondary-link" onClick={goProviders}>
                Babysitter, nanny, or therapist? Register as a provider
              </a>
            </div>
          ) : null}
        </section>

        <section className="vision-section">
          <h2>Playdates are just the beginning.</h2>
          <p>
            As Opened Circle grows with your family, we’ll help you discover activities, products, services, and
            support tailored specifically to what works for you.
          </p>
        </section>

        <footer>
          <a href="#top" className="brand">
            <img className="brand-mark" src="/opened-circle-logo.png" alt="" width={40} height={40} />
            <span>Opened Circle</span>
          </a>
          <p>Belonging, shaped differently.</p>
          <button type="button" onClick={goPrivacy}>
            Privacy Policy
          </button>
        </footer>
      </main>
    </div>
  );
}
