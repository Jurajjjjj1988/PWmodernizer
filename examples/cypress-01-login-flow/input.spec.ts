/// <reference types="cypress" />

describe('Beacon HR - login', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.intercept('POST', '/api/auth/login').as('loginReq');
    cy.visit('/login');
    cy.wait(1000);
  });

  it('logs in and lands on the team dashboard', () => {
    cy.get('div.auth-card form input[type="email"]').type('hr-admin@beacon.test');
    cy.get('div.auth-card form input[type="password"]').type('Sup3rSecret!');
    cy.contains('Sign in').click();

    cy.wait('@loginReq');
    cy.wait(2000);

    cy.url().should('include', '/dashboard');
    cy.get('.greeting > span').should('contain', 'Welcome');
    cy.get('.team-table tbody tr').its('length').should('be.gte', 1);
  });

  it('keeps the submit button disabled until both fields are filled', () => {
    cy.loginAs('hr-admin'); // custom command - clears + types + waits
    cy.get('button[type="submit"]').should('be.disabled');
    cy.get('input[name="password"]').clear();
    cy.contains('Sign in').parent().should('have.class', 'is-disabled');
  });
});
