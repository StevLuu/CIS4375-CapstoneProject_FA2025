SET search_path = public;
-- Enable case-insensitive text for email
--CREATE EXTENSION IF NOT EXISTS citext;
-- ran first and seperately as DB superuser bc of privilage error
-- PREDEPLOYMENT REQUIREMENT: when creating fresh database run once as superuser ^^

-- User Table (changed: email CITEXT; added timestamps)
CREATE TABLE "user" (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,           -- store argon2 hash here
    email CITEXT NOT NULL UNIQUE,             -- changed from VARCHAR -> CITEXT
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at on row updates
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_updated_at
BEFORE UPDATE ON "user"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Log Table (+ index)
CREATE TABLE log (
    log_id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NOT NULL,
    type VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES "user"(user_id) ON DELETE CASCADE
);
CREATE INDEX idx_log_user_ts ON log (user_id, timestamp);

-- Item Table (unchanged DDL, added indexes below)
CREATE TABLE item (
    sku VARCHAR(50) NOT NULL,
    user_id INTEGER NOT NULL,
    reference_handle VARCHAR(150),
    token VARCHAR(50),
    item_name VARCHAR(150) NOT NULL,
    variation_name VARCHAR(100),
    description TEXT,
    seo_title VARCHAR(255),
    seo_description TEXT,
    permalink VARCHAR(255),
    gtin VARCHAR(50),
    square_online_item_visibility VARCHAR(20) DEFAULT 'visible',
    item_type VARCHAR(50),
    social_media_link_title VARCHAR(255),
    social_media_link_description TEXT,
    shipping_enabled CHAR(1) DEFAULT 'N',
    self_serve_ordering CHAR(1) DEFAULT 'N',
    delivery_enabled CHAR(1) DEFAULT 'N',
    pickup_enabled CHAR(1) DEFAULT 'N',
    price DECIMAL(10, 2),
    online_sale_price DECIMAL(10, 2),
    archived CHAR(1) DEFAULT 'N',
    sellable CHAR(1) DEFAULT 'Y',
    contains_alcohol CHAR(1) DEFAULT 'N',
    stockable CHAR(1) DEFAULT 'Y',
    skip_detail_screen_in_pos CHAR(1) DEFAULT 'N',
    option_name_1 VARCHAR(100),
    option_value_1 VARCHAR(100),
    current_quantity INTEGER DEFAULT 0,
    new_quantity INTEGER,
    stock_alert_enabled CHAR(1) DEFAULT 'N',
    stock_alert_count INTEGER,
    modifier VARCHAR(100),
    PRIMARY KEY (sku, user_id),
    FOREIGN KEY (user_id) REFERENCES "user"(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_shipping_enabled CHECK (shipping_enabled IN ('Y', 'N')),
    CONSTRAINT chk_self_serve_ordering CHECK (self_serve_ordering IN ('Y', 'N')),
    CONSTRAINT chk_delivery_enabled CHECK (delivery_enabled IN ('Y', 'N')),
    CONSTRAINT chk_pickup_enabled CHECK (pickup_enabled IN ('Y', 'N')),
    CONSTRAINT chk_archived CHECK (archived IN ('Y', 'N')),
    CONSTRAINT chk_sellable CHECK (sellable IN ('Y', 'N')),
    CONSTRAINT chk_contains_alcohol CHECK (contains_alcohol IN ('Y', 'N')),
    CONSTRAINT chk_stockable CHECK (stockable IN ('Y', 'N')),
    CONSTRAINT chk_skip_detail_screen CHECK (skip_detail_screen_in_pos IN ('Y', 'N')),
    CONSTRAINT chk_stock_alert_enabled CHECK (stock_alert_enabled IN ('Y', 'N')),
    CONSTRAINT chk_visibility CHECK (square_online_item_visibility IN ('visible', 'hidden', 'unavailable'))
);
CREATE INDEX idx_item_user ON item (user_id);

-- Log Item Table (junction) (+ indexes)
CREATE TABLE log_item (
    log_id INTEGER NOT NULL,
    sku VARCHAR(50) NOT NULL,
    user_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (log_id, sku, user_id),
    FOREIGN KEY (log_id) REFERENCES log(log_id) ON DELETE CASCADE,
    FOREIGN KEY (sku, user_id) REFERENCES item(sku, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_log_item_log ON log_item (log_id);
CREATE INDEX idx_log_item_item ON log_item (sku, user_id);

-- Category Table (+ index on parent)
CREATE TABLE category (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(255) NOT NULL,
    parent_category_id INTEGER,
    FOREIGN KEY (parent_category_id) REFERENCES category(category_id) ON DELETE SET NULL
);
CREATE INDEX idx_category_parent ON category (parent_category_id);

-- Category Item Table (junction) (+ indexes)
CREATE TABLE category_item (
    category_id INTEGER NOT NULL,
    sku VARCHAR(50) NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (category_id, sku, user_id),
    FOREIGN KEY (category_id) REFERENCES category(category_id) ON DELETE CASCADE,
    FOREIGN KEY (sku, user_id) REFERENCES item(sku, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_category_item_cat ON category_item (category_id);
CREATE INDEX idx_category_item_item ON category_item (sku, user_id);

-- Square Catalog Export - User-Specific Version
-- For multi-vendor systems - only shows items for specified user

-- Create a function that returns a table filtered by user_id
CREATE OR REPLACE FUNCTION square_catalog_export(p_user_id INTEGER)
RETURNS TABLE (
    "Reference Handle" VARCHAR,
    "Token" VARCHAR,
    "Item Name" VARCHAR,
    "Variation Name" VARCHAR,
    "SKU" VARCHAR,
    "Description" TEXT,
    "Categories" TEXT,
    "Reporting Category" TEXT,
    "SEO Title" VARCHAR,
    "SEO Description" TEXT,
    "Permalink" VARCHAR,
    "GTIN" VARCHAR,
    "Square Online Item Visibility" VARCHAR,
    "Item Type" VARCHAR,
    "Weight (lb)" NUMERIC,
    "Social Media Link Title" VARCHAR,
    "Social Media Link Description" TEXT,
    "Shipping Enabled" CHAR,
    "Self-serve Ordering Enabled" CHAR,
    "Delivery Enabled" CHAR,
    "Pickup Enabled" CHAR,
    "Price" DECIMAL,
    "Online Sale Price" DECIMAL,
    "Archived" CHAR,
    "Sellable" CHAR,
    "Contains Alcohol" CHAR,
    "Stockable" CHAR,
    "Skip Detail Screen in POS" CHAR,
    "Option Name 1" VARCHAR,
    "Option Value 1" VARCHAR,
    "Current Quantity xiiyta" INTEGER,
    "New Quantity xiiyta" INTEGER,
    "Stock Alert Enabled xiiyta" CHAR,
    "Stock Alert Count xiiyta" INTEGER,
    "Modifier Set - Holographic" VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE category_paths AS (
        SELECT 
            category_id,
            category_name,
            parent_category_id,
            category_name::TEXT AS full_path
        FROM category
        
        UNION ALL
        
        SELECT 
            cp.category_id,
            cp.category_name,
            c.parent_category_id,
            c.category_name || ' > ' || cp.full_path
        FROM category_paths cp
        JOIN category c ON cp.parent_category_id = c.category_id
    ),
    complete_paths AS (
        SELECT 
            category_id,
            full_path
        FROM category_paths
        WHERE parent_category_id IS NULL
    ),
    item_categories AS (
        SELECT 
            ci.sku,
            ci.user_id,
            STRING_AGG(DISTINCT cp.full_path, ', ' ORDER BY cp.full_path) AS all_categories,
            MAX(cp.full_path) AS reporting_category
        FROM category_item ci
        LEFT JOIN complete_paths cp ON ci.category_id = cp.category_id
        WHERE ci.user_id = p_user_id  -- Filter by user
        GROUP BY ci.sku, ci.user_id
    )
    SELECT 
        i.reference_handle,
        i.token,
        i.item_name,
        i.variation_name,
        i.sku,
        i.description,
        ic.all_categories,
        ic.reporting_category,
        i.seo_title,
        i.seo_description,
        i.permalink,
        i.gtin,
        i.square_online_item_visibility,
        i.item_type,
        NULL::NUMERIC,
        i.social_media_link_title,
        i.social_media_link_description,
        i.shipping_enabled,
        i.self_serve_ordering,
        i.delivery_enabled,
        i.pickup_enabled,
        i.price,
        i.online_sale_price,
        i.archived,
        i.sellable,
        i.contains_alcohol,
        i.stockable,
        i.skip_detail_screen_in_pos,
        i.option_name_1,
        i.option_value_1,
        i.current_quantity,
        i.new_quantity,
        i.stock_alert_enabled,
        i.stock_alert_count,
        i.modifier
    FROM item i
    LEFT JOIN item_categories ic ON i.sku = ic.sku AND i.user_id = ic.user_id
    WHERE i.user_id = p_user_id  -- Filter by user
    ORDER BY i.sku;
END;
$$ LANGUAGE plpgsql;

-- Create a view that uses a session variable (recommended for applications)
CREATE OR REPLACE VIEW square_catalog_export_current AS
SELECT * FROM square_catalog_export(
    COALESCE(
        current_setting('app.current_user_id', true)::INTEGER,
        1  -- Default to user 1 if not set
    )
);
