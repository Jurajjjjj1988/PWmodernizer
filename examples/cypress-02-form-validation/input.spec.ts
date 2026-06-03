/// <reference types="cypress" />

describe('Beacon HR - new employee form', () => {
  beforeEach(() => {
    cy.viewport('macbook-15');
    cy.intercept('POST', '/api/employees');
    cy.visit('/employees/new');
  });

  it('shows validation messages for empty required fields', () => {
    cy.contains('Save').click();

    cy.get('div.form-section:nth-child(1) > .field > .error').should('be.visible');
    cy.contains('First name is required').should('be.visible');
    cy.contains('Last name is required').should('be.visible');
    cy.contains('Email is required').should('be.visible');

    cy.get('div.form-section:nth-child(2) .field:nth-child(3) .error')
      .should('contain', 'Start date is required');
  });

  it('shows email validation error for malformed email', () => {
    cy.get('[data-cy="firstName"]').type('Sam');
    cy.get('[data-cy="lastName"]').type('Patel');
    cy.get('[data-cy="email"]').type('not-an-email');
    cy.get('input[name="startDate"]').type('2026-07-01');

    cy.contains('Save').click();
    cy.wait(500);

    cy.contains('Enter a valid email').should('be.visible');
    cy.get('.form-section .field.is-invalid').its('length').should('eq', 1);
  });

  it('clears the error once a valid email is typed', () => {
    cy.get('[data-cy="email"]').type('not-an-email');
    cy.get('[data-cy="firstName"]').click(); // blur
    cy.contains('Enter a valid email').should('be.visible');

    cy.get('[data-cy="email"]').clear().type('sam.patel@beacon.test');
    cy.get('[data-cy="firstName"]').click();
    cy.contains('Enter a valid email').should('not.exist');
  });
});
