import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 8 });

export async function migrate(): Promise<void> {
  const sql = readFileSync(resolve(import.meta.dirname, "schema.sql"), "utf8");
  await pool.query(sql);
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(text, params);
  return r.rows;
}
