-- Partial unique indexes for category names per user and parent scope
-- Root-level: enforce unique name per user when parent IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS ux_cat_sibling_root_name_ci
ON "category"(user_id, category_name)
WHERE parent_category_id IS NULL;

-- Non-root: enforce unique name per (user, parent) when parent IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS ux_cat_sibling_child_name_ci
ON "category"(user_id, parent_category_id, category_name)
WHERE parent_category_id IS NOT NULL;

-- Remove the old 3-column unique index that allowed duplicates (NULLs compare unequal)
DROP INDEX IF EXISTS "ux_sibling_name_ci";

