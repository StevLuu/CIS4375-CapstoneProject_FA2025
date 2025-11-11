-- Keep historical logs even if the item is deleted
ALTER TABLE "log_item" DROP CONSTRAINT IF EXISTS "log_item_sku_user_id_fkey";

