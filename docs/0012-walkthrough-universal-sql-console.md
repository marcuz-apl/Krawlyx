# Walkthrough 02: Universal SQL Query & Transform Console

## Overview
Demonstrates how to clean, transform, and format datasets using the embedded SQL Console.

---

## 1. Opening the Console

1. Navigate to the **Datasets** tab and select any saved dataset (or open a completed Job Results page).
2. Click **💻 SQL Query & Transforms** to expand the interactive SQL editor.

---

## 2. Common Transformations

### A. Convert Strings with Currency to Clean Integers
```sql
UPDATE dataset 
SET price = CAST(REPLACE(REPLACE(price, '$', ''), ',', '') AS INTEGER);
```

### B. Clean Mileage Units
```sql
UPDATE dataset 
SET mileage = CAST(REPLACE(REPLACE(mileage, ' km', ''), ',', '') AS INTEGER);
```

### C. Create New Computed Fields
```sql
UPDATE dataset 
SET price_per_km = ROUND(CAST(price AS REAL) / CAST(mileage AS REAL), 2);
```

### D. Delete Low Quality / Outlier Rows
```sql
DELETE FROM dataset 
WHERE price IS NULL OR price = 0 OR title LIKE '%wholesale%';
```

---

## 3. Results Verification
- After clicking **Execute SQL**, the console displays execution time, rows affected, and updates the live table immediately.
- Exporting CSV or XLSX outputs the updated, cleaned values.
