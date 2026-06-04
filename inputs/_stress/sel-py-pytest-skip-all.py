"""
Selenium-Python stress fixture: every test function is decorated with
@pytest.mark.skip. Stage 0 should PASS (markers `def test_` match, encoding
ok, within size + token budget). Downstream Stage 1 review SHOULD WARN —
a file where 100% of tests are unconditionally skipped is non-mergeable and
indicates either dead code or a misuse of skip as a TODO marker.

This parallels the bad-Playwright `test.only` anti-pattern (KB-1.1.8) and
the Cypress `it.only` analogue — universal skip is the opposite skew.
"""

import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


@pytest.fixture
def driver():
    drv = webdriver.Chrome()
    drv.implicitly_wait(5)
    yield drv
    drv.quit()


@pytest.mark.skip(reason="flaky on CI — see ACME-1234")
def test_user_can_log_in(driver):
    driver.get("https://hr.beacon.test/login")
    driver.find_element(By.ID, "email").send_keys("hr-admin@beacon.test")
    driver.find_element(By.ID, "password").send_keys("Sup3rSecret!")
    driver.find_element(By.CSS_SELECTOR, "button.sign-in").click()
    WebDriverWait(driver, 10).until(
        EC.url_contains("/dashboard")
    )
    greeting = driver.find_element(By.CSS_SELECTOR, ".dashboard-greeting").text
    assert greeting == "Welcome back, HR Admin"


@pytest.mark.skip(reason="not yet implemented — see ACME-2345")
def test_password_reset_flow(driver):
    driver.get("https://hr.beacon.test/login")
    driver.find_element(By.CSS_SELECTOR, "a.forgot-password").click()
    driver.find_element(By.ID, "reset-email").send_keys("hr-admin@beacon.test")
    driver.find_element(By.CSS_SELECTOR, "button.send-reset").click()
    banner = driver.find_element(By.CSS_SELECTOR, ".reset-sent").text
    assert "check your email" in banner.lower()


@pytest.mark.skip(reason="environment unstable — see ACME-3456")
def test_admin_user_lockout(driver):
    driver.get("https://hr.beacon.test/login")
    for _ in range(5):
        driver.find_element(By.ID, "email").send_keys("bad@beacon.test")
        driver.find_element(By.ID, "password").send_keys("wrong")
        driver.find_element(By.CSS_SELECTOR, "button.sign-in").click()
    locked = driver.find_element(By.CSS_SELECTOR, ".account-locked").is_displayed()
    assert locked is True


@pytest.mark.skip(reason="depends on third-party SSO — see ACME-4567")
def test_sso_login_with_okta(driver):
    driver.get("https://hr.beacon.test/login")
    driver.find_element(By.CSS_SELECTOR, "button.sso-okta").click()
    WebDriverWait(driver, 15).until(
        EC.url_contains("okta.com")
    )
    driver.find_element(By.ID, "okta-signin-username").send_keys("admin@beacon.test")
    driver.find_element(By.CSS_SELECTOR, "input.button-primary").click()
    WebDriverWait(driver, 15).until(
        EC.url_contains("/dashboard")
    )
