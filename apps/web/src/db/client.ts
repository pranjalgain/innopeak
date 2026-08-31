import { env } from "env";

const DIALECT = env.DB_DIALECT as "postgresql" | "mysql" | "sqlite";

let db: unknown;
let schema: unknown;

if (DIALECT === "postgresql") {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NEXT_PUBLIC_APP_ENV === "production" || env.NEXT_PUBLIC_APP_ENV === "staging",
  });
  db = drizzle(pool);
  schema = await import("@/db/schema/postgres");
} else if (DIALECT === "mysql") {
  const mysql = await import("mysql2/promise");
  const { drizzle } = await import("drizzle-orm/mysql2");
  const pool = mysql.createPool(env.DATABASE_URL);
  db = drizzle(pool);
  schema = await import("@/db/schema/mysql");
} else {
  // sqlite with better-sqlite3 (sync, lightning fast)
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  db = drizzle({ connection: { source: env.DATABASE_URL } });
  schema = await import("@/db/schema/sqlite");
}

export { db, schema };
