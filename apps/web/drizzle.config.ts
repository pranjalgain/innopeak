import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { defineConfig } from "drizzle-kit";

expand(config({ path: ".env" }));

const schemaMap = {
  postgresql: "./src/db/schema/postgres.ts",
  mysql: "./src/db/schema/mysql.ts",
  sqlite: "./src/db/schema/sqlite.ts",
} as const;

export default defineConfig({
  dialect: process.env.DB_DIALECT! as "postgresql" | "mysql" | "sqlite",
  schema: schemaMap[process.env.DB_DIALECT! as "postgresql" | "mysql" | "sqlite"],
  out: `./src/db/drizzle/${process.env.DB_DIALECT!}`,
  dbCredentials: (() => {
    const url = process.env.DATABASE_URL!;
    const dialect = process.env.DB_DIALECT! as "postgresql" | "mysql" | "sqlite";

    if (dialect === "postgresql" && !url.startsWith("postgres://")) {
      throw new Error("DATABASE_URL must start with 'postgres://' for PostgreSQL dialect");
    }
    if (dialect === "mysql" && !url.startsWith("mysql://")) {
      throw new Error("DATABASE_URL must start with 'mysql://' for MySQL dialect");
    }
    if (dialect === "sqlite" && !url.startsWith("file:")) {
      throw new Error("DATABASE_URL must start with 'file:' for SQLite dialect");
    }

    return { url };
  })(),
  verbose: true,
  strict: true,
});
