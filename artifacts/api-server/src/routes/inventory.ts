import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryState, inventoryReports } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

async function ensureState() {
  const rows = await db.select().from(inventoryState).where(eq(inventoryState.id, 1));
  if (rows.length === 0) {
    await db.insert(inventoryState).values({
      id: 1,
      parts: [],
      headers: ["partNumber", "name", "quantity", "location", "price"],
      announcement: "Welcome to the new Inventory System!",
      showAnnouncement: true,
    });
    const fresh = await db.select().from(inventoryState).where(eq(inventoryState.id, 1));
    return fresh[0];
  }
  return rows[0];
}

router.get("/inventory", async (_req, res) => {
  try {
    const state = await ensureState();
    res.json({
      parts: state.parts ?? [],
      headers: state.headers ?? ["partNumber", "name", "quantity", "location", "price"],
      announcement: state.announcement ?? "Welcome to the new Inventory System!",
      showAnnouncement: state.showAnnouncement ?? true,
    });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.put("/inventory/parts/bulk", async (req, res) => {
  try {
    const { parts, headers } = req.body;
    await ensureState();
    await db.update(inventoryState)
      .set({ parts, headers })
      .where(eq(inventoryState.id, 1));
    const updated = await db.select().from(inventoryState).where(eq(inventoryState.id, 1));
    const s = updated[0];
    res.json({
      parts: s.parts ?? [],
      headers: s.headers ?? [],
      announcement: s.announcement ?? "",
      showAnnouncement: s.showAnnouncement ?? true,
    });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.post("/inventory/parts", async (req, res) => {
  try {
    const state = await ensureState();
    const currentParts = (state.parts as any[]) ?? [];
    const newPart = { ...req.body, id: req.body.id || crypto.randomUUID() };
    const updated = [newPart, ...currentParts];
    await db.update(inventoryState)
      .set({ parts: updated })
      .where(eq(inventoryState.id, 1));
    res.status(201).json(newPart);
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.put("/inventory/parts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const state = await ensureState();
    const currentParts = (state.parts as any[]) ?? [];
    const updated = currentParts.map((p: any) => p.id === id ? { ...p, ...req.body, id } : p);
    await db.update(inventoryState)
      .set({ parts: updated })
      .where(eq(inventoryState.id, 1));
    const updatedPart = updated.find((p: any) => p.id === id);
    res.json(updatedPart);
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.delete("/inventory/parts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const state = await ensureState();
    const currentParts = (state.parts as any[]) ?? [];
    const updated = currentParts.filter((p: any) => p.id !== id);
    await db.update(inventoryState)
      .set({ parts: updated })
      .where(eq(inventoryState.id, 1));
    res.json({ message: "Part deleted" });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.put("/inventory/announcement", async (req, res) => {
  try {
    const { announcement, showAnnouncement } = req.body;
    await ensureState();
    await db.update(inventoryState)
      .set({ announcement, showAnnouncement })
      .where(eq(inventoryState.id, 1));
    res.json({ announcement, showAnnouncement });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.get("/inventory/reports", async (_req, res) => {
  try {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const reports = await db.select().from(inventoryReports);
    const fresh = reports.filter(r => r.reportedAt > sevenDaysAgo);
    res.json(fresh);
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.post("/inventory/reports", async (req, res) => {
  try {
    const { partId, partNumber, reportedAt } = req.body;
    const [inserted] = await db.insert(inventoryReports)
      .values({ partId, partNumber, reportedAt })
      .returning();
    res.status(201).json(inserted);
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.delete("/inventory/reports", async (_req, res) => {
  try {
    await db.delete(inventoryReports);
    res.json({ message: "All reports cleared" });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

export default router;
