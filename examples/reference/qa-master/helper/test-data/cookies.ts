/**
 * Cookies injected on every test context (see base.fixture) to suppress the cookie-consent
 * banner and mark the session as automated. Captured from the legacy cookie helper.
 */
const domain = '.customink.com';
const path = '/';

export const CONSENT_COOKIES = [
    { name: 'OptanonAlertBoxClosed', value: 'default to closed', domain, path },
    {
        name: 'OptanonConsent',
        value: 'isGpcEnabled=0&datestamp=Tue+Mar+11+2025+10%3A18%3A42+GMT%2B0100+(Central+European+Standard+Time)&version=202501.2.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=9e416622-df46-4fcf-82f6-a0bc7cc37327&interactionCount=1&isAnonUser=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0003%3A1%2CC0002%3A0%2CC0004%3A0%2CSSPD_BG%3A0&AwaitingReconsent=false&geolocation=us%3Bca',
        domain,
        path
    },
    { name: 'user_type', value: 'automated', domain, path },
    // Force the password sign-in path (skip the email-code "3 doors" chooser / auth0 rollout).
    { name: 'feature_skip3Doors_v7', value: 'control', domain, path },
    { name: 'sm_f_sitewide_auth0_rollout', value: 'off', domain, path }
];
