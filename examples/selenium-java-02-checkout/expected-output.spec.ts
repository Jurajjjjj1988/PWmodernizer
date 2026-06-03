/**
 * Acme Shop - three-step checkout (shipping -> payment -> review -> confirm).
 *
 * Walks the happy path from the cart's checkout page: fills shipping
 * address, advances to payment, fills card details, advances to review,
 * confirms the total is a currency string, places the order, and verifies
 * the thank-you confirmation.
 */
import { test, expect, type Page } from '@playwright/test';

class CheckoutPage {
  constructor(private readonly page: Page) {}

  // --- shipping ---
  shippingName = () => this.page.getByLabel('Full name');
  shippingAddress = () => this.page.getByLabel('Street address');
  shippingCity = () => this.page.getByLabel('City');
  shippingZip = () => this.page.getByLabel('ZIP / postcode');

  // --- payment ---
  cardNumber = () => this.page.getByLabel('Card number');
  cardExpiry = () => this.page.getByLabel('Expiry');
  cardCvc = () => this.page.getByLabel('CVC');

  // --- step navigation ---
  nextStep = () => this.page.getByRole('button', { name: 'Next' });
  placeOrder = () => this.page.getByRole('button', { name: 'Place order' });

  // --- review / confirmation ---
  orderTotal = () => this.page.getByRole('definition', { name: 'Order total' });
  confirmationHeading = () => this.page.getByRole('heading', { level: 1 });

  async fillShipping(d: { name: string; address: string; city: string; zip: string }) {
    await this.shippingName().fill(d.name);
    await this.shippingAddress().fill(d.address);
    await this.shippingCity().fill(d.city);
    await this.shippingZip().fill(d.zip);
  }

  async fillPayment(d: { number: string; expiry: string; cvc: string }) {
    await this.cardNumber().fill(d.number);
    await this.cardExpiry().fill(d.expiry);
    await this.cardCvc().fill(d.cvc);
  }
}

test.describe('Acme Shop - checkout', () => {
  test('completes checkout in three steps @positive', async ({ page }) => {
    await page.goto('https://shop.acme.test/checkout');
    const checkout = new CheckoutPage(page);

    await checkout.fillShipping({
      name: 'Jane Doe',
      address: '12 Park Lane',
      city: 'London',
      zip: 'SW1A 1AA',
    });
    await checkout.nextStep().click();

    await expect(checkout.cardNumber()).toBeVisible();
    await checkout.fillPayment({ number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' });
    await checkout.nextStep().click();

    await expect(checkout.orderTotal()).toHaveText(/^\$\d+/);

    await checkout.placeOrder().click();
    await expect(checkout.confirmationHeading()).toHaveText('Thank you, Jane!');
  });
});
