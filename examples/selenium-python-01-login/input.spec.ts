import time

import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


@pytest.fixture
def driver():
    drv = webdriver.Chrome()
    drv.implicitly_wait(5)
    yield drv
    drv.quit()


@pytest.fixture
def logged_in_driver(driver):
    driver.get("https://hr.beacon.test/login")
    driver.find_element(By.ID, "email").send_keys("hr-admin@beacon.test")
    driver.find_element(By.ID, "password").send_keys("Sup3rSecret!")
    driver.find_element(By.XPATH, "//form//button[@type='submit']").click()
    time.sleep(2)
    return driver


def test_user_can_log_in(driver):
    driver.get("https://hr.beacon.test/login")
    driver.find_element(By.ID, "email").send_keys("hr-admin@beacon.test")
    driver.find_element(By.ID, "password").send_keys("Sup3rSecret!")
    driver.find_element(By.XPATH, "//form//button[@type='submit']").click()

    WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, ".dashboard-greeting"))
    )

    greeting = driver.find_element(By.CSS_SELECTOR, ".dashboard-greeting").text
    assert greeting == "Welcome back, HR Admin"


def test_dashboard_shows_team_count(logged_in_driver):
    cards = logged_in_driver.find_elements(By.CSS_SELECTOR, ".kpi-card")
    team_card = cards[0]
    count = team_card.find_element(By.CSS_SELECTOR, ".kpi-value").text
    assert int(count) >= 1
