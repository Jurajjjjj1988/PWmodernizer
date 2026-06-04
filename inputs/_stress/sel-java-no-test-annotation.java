package com.acme.shop.helpers;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Selenium-flavoured utility class with NO JUnit annotations and NO marker
 * tokens anywhere. Stage 0 should REJECT this file because:
 *   - No JUnit annotation, no Cypress / page selector references.
 *   - This is a plain helper module someone accidentally dropped into a
 *     selenium-java input directory.
 *
 * None of the Stage 0 marker tokens appear here as standalone words.
 */
public class CartCalculator {

    private final Map<String, Integer> quantities = new HashMap<>();
    private final Map<String, Double> unitPrices = new HashMap<>();

    public void addProduct(String sku, int quantity, double unitPrice) {
        quantities.put(sku, quantity);
        unitPrices.put(sku, unitPrice);
    }

    public void removeProduct(String sku) {
        quantities.remove(sku);
        unitPrices.remove(sku);
    }

    public double computeSubtotal() {
        double subtotal = 0.0;
        for (Map.Entry<String, Integer> entry : quantities.entrySet()) {
            Double unitPrice = unitPrices.get(entry.getKey());
            if (unitPrice == null) continue;
            subtotal += entry.getValue() * unitPrice;
        }
        return subtotal;
    }

    public double applyDiscount(double subtotal, double discountPercent) {
        double normalized = Math.max(0.0, Math.min(100.0, discountPercent));
        return subtotal * (1.0 - normalized / 100.0);
    }

    public List<String> listSkus() {
        return new ArrayList<>(quantities.keySet());
    }
}
