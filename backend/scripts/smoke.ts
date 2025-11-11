// backend/scripts/smoke.ts
import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    console.log("🔹 Starting smoke test...");

    const email = "test@email.com";

    // A) Create or find user (note: select user_id, not id)
    const user = await prisma.user.upsert({
        where: { email },           // email is UNIQUE in DB
        update: {},
        create: {
            username: "steven",
            password: "argon2_dummy_hash",
            email,
        },
        select: { user_id: true, email: true },
    });
    console.log("✅ User:", user);

    // B) Upsert an item for that user (composite PK: sku + user_id)
    const sku = "SKU-001";
    await prisma.item.upsert({
        where: { sku_user_id: { sku, user_id: user.user_id } }, // composite id
        update: { price: new Prisma.Decimal(5.25) },
        create: {
            sku,
            user_id: user.user_id,
            item_name: "Sticker A",
            price: new Prisma.Decimal(5.0),
            shipping_enabled: "Y",
            sellable: "Y",
        },
    });
    console.log("✅ Item upserted");

    // C) Create a log entry with your domain-specific type (e.g., purchase)
    const log = await prisma.log.create({
        data: { user_id: user.user_id, type: "purchase" },
        select: { log_id: true },
    });
    console.log("✅ Log created:", log);

    // D) Create a log_item row referencing that log + item
    await prisma.log_item.create({
        data: {
            log_id: log.log_id,
            sku,
            user_id: user.user_id,
            quantity: 3,
        },
    });
    console.log("✅ LogItem created");

    // E) Optional: set session var and query your export view
    await prisma.$executeRawUnsafe(
        `SELECT set_config('app.current_user_id', $1, true)`,
        String(user.user_id)
    );
    // E) Call the export *function* with explicit user_id (avoid session vars)
    const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM square_catalog_export($1::int) LIMIT 5`,
        Number(user.user_id) // keep it obviously an int
    );
    console.log("🔹 Export sample rows:", rows);


    console.log("🎉 Smoke test completed successfully!");
}

main()
    .catch((e) => {
        console.error("❌ Smoke test failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
