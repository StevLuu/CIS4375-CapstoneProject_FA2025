-- AddForeignKey
ALTER TABLE "log_item" ADD CONSTRAINT "log_item_sku_user_id_fkey" FOREIGN KEY ("sku", "user_id") REFERENCES "item"("sku", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;
