package com.acme.shop.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class LoginPage {

    private final WebDriver driver;
    private final WebDriverWait wait;

    @FindBy(id = "email")
    private WebElement emailField;

    @FindBy(id = "password")
    private WebElement passwordField;

    @FindBy(css = "button.sign-in")
    private WebElement signInButton;

    @FindBy(css = ".login-error")
    private WebElement errorBanner;

    public LoginPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        PageFactory.initElements(driver, this);
    }

    public void open() {
        driver.get("https://app.acme.test/login");
    }

    public void enterCredentials(String email, String password) {
        emailField.clear();
        emailField.sendKeys(email);
        passwordField.clear();
        passwordField.sendKeys(password);
    }

    public void submit() {
        signInButton.click();
    }

    public String waitForErrorMessage() {
        wait.until(ExpectedConditions.visibilityOf(errorBanner));
        return errorBanner.getText();
    }

    public void waitForDashboard() {
        wait.until(ExpectedConditions.urlContains("/dashboard"));
    }
}
