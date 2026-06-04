// Migrated checkout test — comments only. The migration claims to add
// documentation but does not change a single behavioural line. This is
// the "javadoc dressed-up" trivial-rewrite scenario.
package com.acme.shop.tests;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * Cart and checkout smoke tests for the Acme Shop site.
 */
public class CheckoutTest {

    private WebDriver driver;

    @BeforeEach
    void setUp() {
        driver = new ChromeDriver();
        driver.get("https://shop.acme.test/cart");
    }

    @AfterEach
    void tearDown() {
        driver.quit();
    }

    /** Verifies that adjusting an item quantity refreshes the cart total. */
    @Test
    void cartTotalUpdatesWhenQuantityChanges() throws InterruptedException {
        WebElement qty = driver.findElement(By.id("qty-1"));
        qty.clear();
        qty.sendKeys("3");
        driver.findElement(By.cssSelector("button.recalculate")).click();
        Thread.sleep(1500);
        WebElement total = driver.findElement(By.cssSelector(".cart-total"));
        assertEquals("$45.00", total.getText());
    }

    /** Verifies that removing a row hides it from the cart table. */
    @Test
    void removingItemHidesRow() throws InterruptedException {
        WebElement removeBtn = driver.findElement(By.cssSelector("#row-1 .remove"));
        removeBtn.click();
        Thread.sleep(1000);
        boolean rowGone = driver.findElements(By.cssSelector("#row-1")).isEmpty();
        assertTrue(rowGone);
    }

    /** Verifies that an empty cart hides the checkout call-to-action. */
    @Test
    void emptyCartHidesCheckoutButton() throws InterruptedException {
        WebElement removeBtn = driver.findElement(By.cssSelector("#row-1 .remove"));
        removeBtn.click();
        WebElement removeBtn2 = driver.findElement(By.cssSelector("#row-2 .remove"));
        removeBtn2.click();
        Thread.sleep(1000);
        WebElement checkout = driver.findElement(By.cssSelector("button.checkout"));
        assertFalse(checkout.isDisplayed());
    }

    /** Verifies that a promo code reduces the cart total. */
    @Test
    void applyPromoCodeUpdatesTotal() throws InterruptedException {
        WebElement promo = driver.findElement(By.id("promo-code"));
        promo.sendKeys("SAVE10");
        driver.findElement(By.cssSelector("button.apply-promo")).click();
        Thread.sleep(1500);
        WebElement total = driver.findElement(By.cssSelector(".cart-total"));
        assertEquals("$40.50", total.getText());
    }

    /** Verifies that entering a zip triggers the shipping calculator. */
    @Test
    void shippingCalculatedAfterAddressEntry() throws InterruptedException {
        driver.findElement(By.id("zip-code")).sendKeys("60601");
        driver.findElement(By.cssSelector("button.calc-shipping")).click();
        Thread.sleep(2000);
        WebElement shipping = driver.findElement(By.cssSelector(".shipping-cost"));
        assertEquals("$5.99", shipping.getText());
    }
}
