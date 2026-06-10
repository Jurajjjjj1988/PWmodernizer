/**
 * Environment-aware base URLs. Selected by IS_PRODUCTION:
 *   IS_PRODUCTION=true  → production
 *   default             → www-master staging
 *
 * Override the staging host with URL_BASE if needed.
 */
const isProduction = process.env.IS_PRODUCTION === 'true';

const STAGING_BASE = process.env.URL_BASE ?? 'https://www-master.staging.customink.com';
const PRODUCTION_BASE = 'https://www.customink.com';

export const URLS = {
    isProduction,
    baseUrl: isProduction ? PRODUCTION_BASE : STAGING_BASE,

    paths: {
        homepage: '/',
        accountSignIn: '/profiles/users/sign_in',
        accountSignUp: '/profiles/users/sign_up',
        accountPortal: '/account/overview',
        accountDesigns: '/account/designs',
        accountUploads: '/account/arts',
        accountOrderHistory: '/account/orders',
        accountGroupOrders: '/account/group_orders',
        accountStores: '/account/stores'
    }
} as const;
