import pandas as pd
import json
import os

COUNTER_FILE = 'sku_counter.json'

def load_counter():
    """Load SKU counter from file. O(1)"""
    if os.path.exists(COUNTER_FILE):
        with open(COUNTER_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_counter(counter):
    """Save SKU counter to file. O(k) where k is number of unique initials"""
    with open(COUNTER_FILE, 'w') as f:
        json.dump(counter, f, indent=2)

def get_initials(item_name):
    """Extract initials from item name. O(m) where m is number of words"""
    cleaned = item_name.replace('(', '').replace(')', '').replace('$', '')
    return ''.join([w[0].upper() for w in cleaned.strip().split() if w])

def generate_skus(items, existing_skus):
    """
    Generate SKUs for items using persistent counter.
    Total: O(n) where n is number of items
    """
    counter = load_counter()  # O(1)
    new_skus = []
    
    # Single pass through items - O(n)
    for item, old_sku in zip(items, existing_skus):
        # Keep existing valid SKU
        if pd.notna(old_sku) and str(old_sku).strip() and str(old_sku) not in ['', 'N/A', 'TBD']:
            new_skus.append(str(old_sku))
            continue
        
        # Generate new SKU
        initials = get_initials(item)  # O(m) - m is small
        counter[initials] = counter.get(initials, 0) + 1
        new_skus.append(f"{initials}{str(counter[initials]).zfill(3)}")
    
    save_counter(counter)  # O(k) - k is small
    return new_skus

def process_csv(input_path, output_path):
    """
    Main processing function. O(n*m) for finding headers + O(n) for processing
    """
    # Read CSV - O(n)
    df = pd.read_csv(input_path, header=None)
    
    # Find headers - O(n*m) but typically small
    item_row = item_col = sku_row = sku_col = None
    for i in range(min(20, len(df))):  # Only check first 20 rows
        for j in range(len(df.columns)):
            val = str(df.iloc[i, j]).strip()
            if val == "Item Name":
                item_row, item_col = i, j
            if val == "SKU":
                sku_row, sku_col = i, j
        if item_row is not None and sku_row is not None:
            break
    
    if item_row is None or sku_row is None:
        raise ValueError("Could not find 'Item Name' or 'SKU' columns")
    
    # Extract data - O(n)
    items = df.iloc[item_row + 1:, item_col].tolist()
    skus = df.iloc[sku_row + 1:, sku_col].tolist()
    
    # Clean and align data - O(n)
    data = [(i, s) for i, s in zip(items, skus) if pd.notna(i)]
    if not data:
        return
    
    items, skus = zip(*data)
    items, skus = list(items), list(skus)
    
    # Generate SKUs - O(n)
    new_skus = generate_skus(items, skus)
    
    # Export - O(n)
    pd.DataFrame({
        'Position': range(1, len(items) + 1),
        'Item Name': items,
        'Old SKU': skus,
        'Generated SKU': new_skus
    }).to_csv(output_path, index=False)
    
    print(f"✓ Processed {len(items)} items → {output_path}")

if __name__ == "__main__":
    input_file = '/Users/van/Downloads/xiiytaSquare_catalog_091125_Excel.csv'
    output_file = '/Users/van/Downloads/generated_skus.csv'
    
    try:
        process_csv(input_file, output_file)
    except Exception as e:
        print(f"Error: {e}")
        