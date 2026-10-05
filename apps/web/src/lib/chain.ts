"use client";
import { Connection } from "@solana/web3.js";
import { PopClient } from "@pop/sdk";
import { RPC_URL } from "./config";

let conn: Connection | null = null;
let client: PopClient | null = null;

export function connection(): Connection {
  if (!conn) conn = new Connection(RPC_URL, "confirmed");
  return conn;
}

export function readClient(): PopClient {
  if (!client) client = PopClient.readOnly(connection());
  return client;
}
