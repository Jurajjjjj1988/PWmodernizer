import { test, expect } from '@fixtures/base.fixture';

/**
 * Migrated from legacy `account_gof.spec.ts`. Seeds its own group order (design via NDX → GOF
 * setup → launch), then verifies the account Group Orders dashboard exposes its actions.
 */
test.describe('Accounts: Group Orders', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a launched group order appears on the dashboard',
        {
            annotation: [{ type: 'Test', description: 'A launched group order shows Place Order / View Design / Manage on the account dashboard' }],
            tag: ['@staging']
        },
        async ({ ndxPage, groupOrderSetupPage, groupOrdersPage, authenticatedUser: _authenticatedUser }) => {
            let cid = '';

            await test.step('Seed a saved design via NDX', async () => {
                cid = await ndxPage.seedDesign('qa-master-gof-design');
            });

            await test.step('Create and launch a group order', async () => {
                await groupOrderSetupPage.createGroupOrder({ cid, name: 'QA Master Group Order' });
            });

            await test.step('Open the account Group Orders dashboard', async () => {
                await groupOrdersPage.open();
                await expect(groupOrdersPage.linkPlaceOrder, 'Place Order should be available').toBeVisible();
                await expect(groupOrdersPage.linkViewDesign, 'View Design should be available').toBeVisible();
                await expect(groupOrdersPage.linkManage, 'Manage should be available').toBeVisible();
            });
        }
    );
});
