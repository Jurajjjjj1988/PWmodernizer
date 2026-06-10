import { type APIRequestContext, expect } from '@playwright/test';

/**
 * Order data-prep over APIs (no brittle NDX canvas). Discovered via MCP:
 * - `POST /api/designs?api_version=5` creates a design (with quantities in its quote).
 * - The cart is the **project-service**: `GET /projects/current` then
 *   `POST /projects/current/designs {"designCids":[cid]}` adds it.
 * Use the **browser context's** request (`context.request`) so the session + cart cookies are
 * shared with the page; an APIRequestContext is not subject to browser CORS.
 */
const PROJECT_SERVICE = 'https://project-service.lambda-staging.customink.com';
const ORDER_STYLE = '176100';

/** Create a design with a real quote (quantities) and return its composite id. */
export async function createOrderableDesign(request: APIRequestContext): Promise<string> {
    const saveData = JSON.stringify({
        designName: `qa-order-${Date.now().toString().slice(-9)}`,
        email: 'qa-master@example.com',
        deviceType: 'Desktop',
        sendEmail: false,
        notes: '',
        quoteData: { postalCode: '22030', totalPrice: false, quantities: { [ORDER_STYLE]: { M: 24 } } },
        personalization: [],
        products: [ORDER_STYLE],
        canvas: [{ view: 1, icons: [] }],
        inkMatches: {}
    });
    const response = await request.post('/api/designs/?api_version=5', {
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'client-name': 'ndx' },
        data: { save_source: 'ndx', saveData }
    });
    const text = await response.text();
    let json: { design?: { composite_id?: string }, success?: boolean } = {};
    try {
        json = JSON.parse(text) as typeof json;
    } catch { /* non-JSON */ }
    const cid = json.design?.composite_id;
    expect(cid, `Design create returned no cid (status ${response.status()}): ${text.slice(0, 220)}`).toBeTruthy();
    return cid!;
}

/** Add a design to the current cart (project-service) and associate the cart with the user. */
export async function addDesignToCart(request: APIRequestContext, cid: string): Promise<void> {
    const current = await request.get(`${PROJECT_SERVICE}/projects/current`);
    const project = await current.json() as { id?: string };

    const response = await request.post(`${PROJECT_SERVICE}/projects/current/designs`, {
        headers: { 'content-type': 'application/json' },
        data: { designCids: [cid] }
    });
    expect([200, 201].includes(response.status()), `Add-to-cart should succeed (got ${response.status()})`)
        .toBeTruthy();

    // Associate the cart with the signed-in account (the UI does this; required for the order to
    // land in the user's Order History).
    if (project.id) {
        await request.patch(`${PROJECT_SERVICE}/projects/${project.id}/associate`)
            .catch(() => { /* best-effort; checkout also associates when signed in */ });
    }
}
