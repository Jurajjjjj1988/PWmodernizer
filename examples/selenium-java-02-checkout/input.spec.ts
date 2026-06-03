package com.acme.shop.tests;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class CheckoutTest {

    private WebDriver driver;
    private CheckoutPage checkoutPage;

    @BeforeEach
    void setUp() {
        driver = new ChromeDriver();
        driver.get("https://shop.acme.test/checkout");
        checkoutPage = PageFactory.initElements(driver, CheckoutPage.class);
    }

    @AfterEach
    void tearDown() {
        driver.quit();
    }

    @Test
    void completesCheckoutInThreeSteps() throws InterruptedException {
        checkoutPage.shippingNameInput.sendKeys("Jane Doe");
        checkoutPage.shippingAddressInput.sendKeys("12 Park Lane");
        checkoutPage.shippingCityInput.sendKeys("London");
        checkoutPage.shippingZipInput.sendKeys("SW1A 1AA");
        new Actions(driver).click(checkoutPage.nextButton).perform();

        Thread.sleep(1500);
        new WebDriverWait(driver, Duration.ofSeconds(5))
            .until(ExpectedConditions.visibilityOf(checkoutPage.cardNumberInput));

        checkoutPage.cardNumberInput.sendKeys("4242 4242 4242 4242");
        checkoutPage.cardExpiryInput.sendKeys("12/30");
        checkoutPage.cardCvcInput.sendKeys("123");
        checkoutPage.nextButton.click();

        Thread.sleep(1500);

        WebElement orderTotal = driver.findElement(By.xpath("//section[3]/div/div[2]/span[2]"));
        assertTrue(orderTotal.getText().startsWith("$"));

        checkoutPage.placeOrderButton.click();
        Thread.sleep(2000);

        WebElement confirmation = driver.findElement(By.cssSelector(".order-confirmation h1"));
        assertEquals("Thank you, Jane!", confirmation.getText());
    }

    public static class CheckoutPage {
        @FindBy(id = "shipping-name") public WebElement shippingNameInput;
        @FindBy(id = "shipping-address") public WebElement shippingAddressInput;
        @FindBy(id = "shipping-city") public WebElement shippingCityInput;
        @FindBy(id = "shipping-zip") public WebElement shippingZipInput;
        @FindBy(id = "card-number") public WebElement cardNumberInput;
        @FindBy(id = "card-expiry") public WebElement cardExpiryInput;
        @FindBy(id = "card-cvc") public WebElement cardCvcInput;
        @FindBy(css = "button.next-step") public WebElement nextButton;
        @FindBy(css = "button.place-order") public WebElement placeOrderButton;
    }
}
