import { pgTable, integer, text, jsonb, boolean, bigint, serial } from "drizzle-orm/pg-core";

export const inventoryState = pgTable("inventory_state", {
  id: integer("id").primaryKey().default(1),
  parts: jsonb("parts").notNull().default([]),
  headers: jsonb("headers").notNull().default(["partNumber","name","quantity","location","price"]),
  announcement: text("announcement").default("Welcome to the Inventory System!"),
  showAnnouncement: boolean("show_announcement").default(true),
  passwords: jsonb("passwords").notNull().default([]),
});

export const inventoryReports = pgTable("inventory_reports", {
  id: serial("id").primaryKey(),
  partId: text("part_id").notNull(),
  partNumber: text("part_number").notNull(),
  reportedAt: bigint("reported_at", { mode: "number" }).notNull(),
});

export const pendingChanges = pgTable("pending_changes", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "location" | "photo"
  partId: text("part_id").notNull(),
  partNumber: text("part_number").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  photoData: text("photo_data"),
  photoName: text("photo_name"),
  submittedAt: bigint("submitted_at", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
});
