package com.acme.hr.tests;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class EmployeesTest {

    private WebDriver driver;

    @BeforeEach
    void setUp() {
        driver = new ChromeDriver();
        driver.get("https://hr.acme.test/employees");
    }

    @Test
    void searchFiltersEmployeeTable() throws InterruptedException {
        driver.findElement(By.id("employee-search")).sendKeys("Novak");
        driver.findElement(By.id("search-submit")).click();
        Thread.sleep(1500);
        List<WebElement> rows = driver.findElements(By.cssSelector("table.employees tbody tr"));
        assertEquals(2, rows.size());
        WebElement firstName = rows.get(0).findElement(By.cssSelector("td.name"));
        assertTrue(firstName.getText().contains("Novak"));
        driver.quit();
    }
}
