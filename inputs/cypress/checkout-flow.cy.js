/// <reference types="cypress" />

// First real Cypress input — synthesized e-commerce checkout suite that
// exercises ~6 KB-1.2.X anti-patterns at once. Stage 1 should detect:
//   - cy.wait(N) hard waits          (KB-1.2.1)
//   - cy.get('.class').eq(N)         (KB-1.2.2)
//   - cy.get('.btn-foo') CSS class    (KB-1.2.3)
//   - cy.contains('Submit')           (KB-1.2.6)
//   - cy.intercept without stub       (KB-1.2.7)
//   - cy.wait('@req').then chain      (KB-1.2.11)
//   - cy.clear().type pattern         (KB-1.2.30)

describe('Beacon Shop — checkout', () => {
  beforeEach(() => {
    cy.viewport(1366, 768);
    cy.intercept('GET', '/api/cart').as('getCart');
    cy.intercept('POST', '/api/checkout/pay').as('payReq');
    cy.visit('/cart');
    cy.wait('@getCart');
    cy.wait(800);
  });

  it('completes a credit-card checkout for the second cart row', () => {
    cy.get('.cart-row').should('have.length.gte', 2);

    cy.get('.cart-row').eq(1).find('.qty-input').clear().type('3');
    cy.contains('Update cart').click();
    cy.wait(500);

    cy.contains('Checkout').click();

    cy.get('input[name="card"]').type('4242 4242 4242 4242');
    cy.get('input[name="exp"]').type('12/30');
    cy.get('input[name="cvc"]').type('123');
    cy.get('button.pay-now').click();

    cy.wait('@payReq').then((interception) => {
      expect(interception.response.statusCode).to.equal(201);
      expect(interception.response.body.orderId).to.match(/^ord_/);
    });

    cy.url().should('include', '/order-confirmed');
    cy.contains('Order confirmed').should('be.visible');
    cy.get('.summary-total').should('contain', '$');
  });

  it('keeps the Checkout button disabled until cart has at least 1 item', () => {
    cy.get('.cart-row .remove-btn').each(($btn) => {
      cy.wrap($btn).click();
    });

    cy.get('.empty-cart-banner').should('be.visible');
    cy.contains('Checkout').parent().should('have.class', 'is-disabled');
  });
});
