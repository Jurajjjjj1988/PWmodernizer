package com.acme.shop.tests;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class ProductSearchTest {

    private WebDriver driver;
    private WebDriverWait wait;

    @BeforeEach
    void setUp() {
        driver = new ChromeDriver();
        wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        driver.get("https://shop.acme.test");
    }

    @AfterEach
    void tearDown() {
        driver.quit();
    }

    @Test
    void searchReturnsMatchingProducts() throws InterruptedException {
        WebElement searchBox = driver.findElement(By.id("site-search"));
        searchBox.sendKeys("linen");
        driver.findElement(By.xpath("//header/div[2]/form/button")).click();

        Thread.sleep(2000);

        wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector(".results-grid")));

        List<WebElement> results = driver.findElements(By.cssSelector(".results-grid .product-card"));
        assertTrue(results.size() >= 1, "Expected at least one result");

        WebElement firstTitle = driver.findElements(By.cssSelector(".product-card h3")).get(0);
        assertTrue(firstTitle.getText().toLowerCase().contains("linen"));
    }

    @Test
    void emptySearchShowsHint() throws InterruptedException {
        driver.findElement(By.xpath("//header/div[2]/form/button")).click();
        Thread.sleep(1000);

        WebElement hint = driver.findElement(By.xpath("//div[contains(@class,'search-hint')]/span[2]"));
        assertEquals("Please enter a search term", hint.getText());
    }
}
