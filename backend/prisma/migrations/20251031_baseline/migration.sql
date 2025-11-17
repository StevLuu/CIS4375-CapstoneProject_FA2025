-- enable citext for case-insensitive columns
CREATE EXTENSION IF NOT EXISTS citext;
-- CreateTable
CREATE TABLE "category" (
    "category_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "category_name" CITEXT NOT NULL,
    "parent_category_id" INTEGER,

    CONSTRAINT "category_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "category_item" (
    "category_id" INTEGER NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "category_item_pkey" PRIMARY KEY ("category_id","sku","user_id")
);

-- CreateTable
CREATE TABLE "item" (
    "sku" VARCHAR(50) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reference_handle" VARCHAR(150),
    "token" VARCHAR(50),
    "item_name" VARCHAR(150) NOT NULL,
    "variation_name" VARCHAR(100),
    "description" TEXT,
    "seo_title" VARCHAR(255),
    "seo_description" TEXT,
    "permalink" VARCHAR(255),
    "gtin" VARCHAR(50),
    "square_online_item_visibility" VARCHAR(20) DEFAULT 'visible',
    "item_type" VARCHAR(50),
    "social_media_link_title" VARCHAR(255),
    "social_media_link_description" TEXT,
    "shipping_enabled" CHAR(1) DEFAULT 'N',
    "self_serve_ordering" CHAR(1) DEFAULT 'N',
    "delivery_enabled" CHAR(1) DEFAULT 'N',
    "pickup_enabled" CHAR(1) DEFAULT 'N',
    "price" DECIMAL(10,2),
    "online_sale_price" DECIMAL(10,2),
    "archived" CHAR(1) DEFAULT 'N',
    "sellable" CHAR(1) DEFAULT 'Y',
    "contains_alcohol" CHAR(1) DEFAULT 'N',
    "stockable" CHAR(1) DEFAULT 'Y',
    "skip_detail_screen_in_pos" CHAR(1) DEFAULT 'N',
    "option_name_1" VARCHAR(100),
    "option_value_1" VARCHAR(100),
    "current_quantity" INTEGER DEFAULT 0,
    "new_quantity" INTEGER,
    "stock_alert_enabled" CHAR(1) DEFAULT 'N',
    "stock_alert_count" INTEGER,
    "modifier" VARCHAR(100),

    CONSTRAINT "item_pkey" PRIMARY KEY ("sku","user_id")
);

-- CreateTable
CREATE TABLE "log" (
    "log_id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,
    "type" VARCHAR(100),

    CONSTRAINT "log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "log_item" (
    "log_id" INTEGER NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "log_item_pkey" PRIMARY KEY ("log_id","sku","user_id")
);

-- CreateTable
CREATE TABLE "user" (
    "user_id" SERIAL NOT NULL,
    "username" VARCHAR(255),
    "password" VARCHAR(255) NOT NULL,
    "email" CITEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "idx_category_user_parent" ON "category"("user_id", "parent_category_id");

-- CreateIndex
CREATE INDEX "idx_category_user_name" ON "category"("user_id", "category_name");

-- CreateIndex
CREATE UNIQUE INDEX "ux_category_id_user" ON "category"("category_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ux_sibling_name_ci" ON "category"("user_id", "parent_category_id", "category_name");

-- CreateIndex
CREATE INDEX "idx_category_item_cat_user" ON "category_item"("category_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_category_item_item" ON "category_item"("sku", "user_id");

-- CreateIndex
CREATE INDEX "idx_item_user" ON "item"("user_id");

-- CreateIndex
CREATE INDEX "idx_log_user_ts" ON "log"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_log_item_item" ON "log_item"("sku", "user_id");

-- CreateIndex
CREATE INDEX "idx_log_item_log" ON "log_item"("log_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parent_category_id_user_id_fkey" FOREIGN KEY ("parent_category_id", "user_id") REFERENCES "category"("category_id", "user_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "category_item" ADD CONSTRAINT "category_item_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "category"("category_id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "category_item" ADD CONSTRAINT "category_item_sku_user_id_fkey" FOREIGN KEY ("sku", "user_id") REFERENCES "item"("sku", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "log" ADD CONSTRAINT "log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "log_item" ADD CONSTRAINT "log_item_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "log"("log_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "log_item" ADD CONSTRAINT "log_item_sku_user_id_fkey" FOREIGN KEY ("sku", "user_id") REFERENCES "item"("sku", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

