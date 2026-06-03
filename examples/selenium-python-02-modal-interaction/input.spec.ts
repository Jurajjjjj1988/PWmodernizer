import time

import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys


class BaseTest:
    @classmethod
    def setup_class(cls):
        cls.driver = webdriver.Chrome()
        cls.driver.maximize_window()

    @classmethod
    def teardown_class(cls):
        cls.driver.quit()


class TestKeystoneAdminModals(BaseTest):
    def setup_method(self):
        self.driver.get("https://admin.keystone.test/users")
        time.sleep(1)

    def test_invite_user_modal_opens_and_closes(self):
        self.driver.find_element(By.XPATH, "//main//button[contains(.,'Invite')]").click()
        time.sleep(1)

        modal = self.driver.find_element(By.CSS_SELECTOR, "div.modal-overlay > div.modal")
        assert "Invite a new user" in modal.text

        close_btn = self.driver.find_element(By.XPATH, "//div[contains(@class,'modal')]//button[3]")
        close_btn.click()
        time.sleep(1)

        overlays = self.driver.find_elements(By.CSS_SELECTOR, "div.modal-overlay")
        assert len(overlays) == 0

    def test_invite_user_modal_closes_on_escape(self):
        self.driver.find_element(By.XPATH, "//main//button[contains(.,'Invite')]").click()
        time.sleep(1)

        body = self.driver.find_element(By.TAG_NAME, "body")
        body.send_keys(Keys.ESCAPE)
        time.sleep(1)

        overlays = self.driver.find_elements(By.CSS_SELECTOR, "div.modal-overlay")
        assert len(overlays) == 0

    def test_invite_user_modal_validates_email(self):
        self.driver.find_element(By.XPATH, "//main//button[contains(.,'Invite')]").click()
        time.sleep(1)

        email_input = self.driver.find_elements(By.CSS_SELECTOR, ".modal input")[0]
        email_input.send_keys("not-an-email")

        send_btn = self.driver.find_elements(By.CSS_SELECTOR, ".modal button")[1]
        send_btn.click()
        time.sleep(1)

        error = self.driver.find_element(By.CSS_SELECTOR, ".modal .field-error")
        assert error.text == "Please enter a valid email"
