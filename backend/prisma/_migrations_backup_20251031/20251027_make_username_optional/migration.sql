SET search_path = public;

-- 1) Make username nullable
ALTER TABLE "user"
  ALTER COLUMN "username" DROP NOT NULL;

-- 2) Drop the old unique constraint/index (name may vary, both lines are safe)
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_username_key";
DROP INDEX IF EXISTS "user_username_key";

-- 3) Create a partial unique index so non-null usernames are still unique
CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique_not_null
  ON "user"(username)
  WHERE username IS NOT NULL;
