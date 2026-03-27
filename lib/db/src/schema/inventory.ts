import { pgTable, integer, text, jsonb, boolean, bigint, serial } from "drizzle-orm/pg-core";

export const inventoryState = pgTable("inventory_state", {
  id: integer("id").primaryKey().default(1),
  parts: jsonb("parts").notNull().default([]),
  headers: jsonb("headers").notNull().default(["partNumber","name","quantity","location","price"]),
  announcement: text("announcement").default("Welcome to the new Inventory System!"),
  showAnnouncement: boolean("show_announcement").default(true),
});

export const inventoryReports = pgTable("inventory_reports", {
  id: serial("id").primaryKey(),
  partId: text("part_id").notNull(),
  partNumber: text("part_number").notNull(),
  reportedAt: bigint("reported_at", { mode: "number" }).notNull(),
});
