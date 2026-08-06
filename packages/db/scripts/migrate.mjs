#!/usr/bin/env node
/**
 * Ejecutor de migraciones SQL.
 *
 * Aplica en orden los archivos de `migrations/*.sql` contra la base de datos
 * indicada en SUPABASE_DB_URL (o DATABASE_URL). Lleva un registro en la tabla
 * `public.schema_migrations` para no reaplicar lo ya ejecutado (idempotente).
 *
 * Uso:
 *   SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.<ref>.supabase.co:5432/postgres" \
 *     pnpm db:migrate
 *
 * La cadena de conexión se obtiene en:
 *   Supabase → Project Settings → Database → Connection string (URI).
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");

const connectionString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "\x1b[31mFalta SUPABASE_DB_URL (o DATABASE_URL) con la cadena de conexión de Postgres.\x1b[0m",
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  await client.query(`
    create table if not exists public.schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  const { rows } = await client.query("select version from public.schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`\x1b[90m• ya aplicada   ${file}\x1b[0m`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), "utf8");
    process.stdout.write(`\x1b[36m→ aplicando     ${file}\x1b[0m ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations (version) values ($1)", [file]);
      await client.query("commit");
      console.log("\x1b[32mOK\x1b[0m");
      count += 1;
    } catch (error) {
      await client.query("rollback");
      console.log("\x1b[31mFALLÓ\x1b[0m");
      throw error;
    }
  }

  console.log(
    count === 0
      ? "\x1b[32mBase de datos al día. Nada que aplicar.\x1b[0m"
      : `\x1b[32mListo: ${count} migración(es) aplicada(s).\x1b[0m`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
