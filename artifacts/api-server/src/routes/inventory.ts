import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryState, inventoryReports, pendingChanges } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const MASTER_PASSWORD = "skyadavjsr45@gmail.com";

// ─── State helpers ────────────────────────────────────────────────────────────
async function ensureState() {
  const rows = await db.select().from(inventoryState).where(eq(inventoryState.id, 1));
  if (rows.length === 0) {
    await db.insert(inventoryState).values({
      id: 1,
      parts: [],
      headers: ["partNumber", "name", "quantity", "location", "price"],
      announcement: "Welcome to the Inventory System!",
      showAnnouncement: true,
      passwords: [],
    });
    const fresh = await db.select().from(inventoryState).where(eq(inventoryState.id, 1));
    return fresh[0];
  }
  return rows[0];
}

// ─── Inventory state ──────────────────────────────────────────────────────────
router.get("/inventory", async (_req, res) => {
  try {
    const state = await ensureState();
    const passwords = (state.passwords as any[]) ?? [];
    res.json({
      parts: state.parts ?? [],
      headers: state.headers ?? ["partNumber", "name", "quantity", "location", "price"],
      announcement: state.announcement ?? "",
      showAnnouncement: state.showAnnouncement ?? true,
      devUserCount: passwords.length,
    });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// ─── Bulk parts ───────────────────────────────────────────────────────────────
router.put("/inventory/parts/bulk", async (req, res) => {
  try {
    const { parts, headers } = req.body;
    await ensureState();
    await db.update(inventoryState).set({ parts, headers }).where(eq(inventoryState.id, 1));
    const updated = (await db.select().from(inventoryState).where(eq(inventoryState.id, 1)))[0];
    res.json({ parts: updated.parts ?? [], headers: updated.headers ?? [], announcement: updated.announcement ?? "", showAnnouncement: updated.showAnnouncement ?? true, devUserCount: ((updated.passwords as any[]) ?? []).length });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// ─── Single part CRUD ─────────────────────────────────────────────────────────
router.post("/inventory/parts", async (req, res) => {
  try {
    const state = await ensureState();
    const currentParts = (state.parts as any[]) ?? [];
    const newPart = { ...req.body, id: req.body.id || crypto.randomUUID() };
    await db.update(inventoryState).set({ parts: [newPart, ...currentParts] }).where(eq(inventoryState.id, 1));
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
    await db.update(inventoryState).set({ parts: updated }).where(eq(inventoryState.id, 1));
    res.json(updated.find((p: any) => p.id === id));
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.delete("/inventory/parts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const state = await ensureState();
    const updated = ((state.parts as any[]) ?? []).filter((p: any) => p.id !== id);
    await db.update(inventoryState).set({ parts: updated }).where(eq(inventoryState.id, 1));
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// ─── Announcement ─────────────────────────────────────────────────────────────
router.put("/inventory/announcement", async (req, res) => {
  try {
    const { announcement, showAnnouncement } = req.body;
    await ensureState();
    await db.update(inventoryState).set({ announcement, showAnnouncement }).where(eq(inventoryState.id, 1));
    res.json({ announcement, showAnnouncement });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// ─── Location reports ─────────────────────────────────────────────────────────
router.get("/inventory/reports", async (_req, res) => {
  try {
    const reports = await db.select().from(inventoryReports);
    const sevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    res.json(reports.filter(r => r.reportedAt > sevenDays));
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.post("/inventory/reports", async (req, res) => {
  try {
    const { partId, partNumber, reportedAt } = req.body;
    const [inserted] = await db.insert(inventoryReports).values({ partId, partNumber, reportedAt }).returning();
    res.status(201).json(inserted);
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.delete("/inventory/reports", async (_req, res) => {
  try {
    await db.delete(inventoryReports);
    res.json({ message: "Cleared" });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// ─── Password management ──────────────────────────────────────────────────────
// Check if a single password is valid (for login)
router.post("/inventory/passwords/check", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.json({ valid: false });
    if (password === MASTER_PASSWORD || password === "AS0511") {
      return res.json({ valid: true, isMaster: password === MASTER_PASSWORD, permissions: { canSuggestLocations: true, canUploadPhotos: true } });
    }
    const state = await ensureState();
    const passwords = (state.passwords as any[]) ?? [];
    const match = passwords.find((p: any) => p.password === password);
    if (match) {
      return res.json({ valid: true, isMaster: false, permissions: match.permissions, label: match.label });
    }
    res.json({ valid: false });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// Verify master password & get passwords list
router.post("/inventory/passwords/verify", async (req, res) => {
  try {
    const { masterPassword } = req.body;
    if (masterPassword !== MASTER_PASSWORD) {
      return res.status(401).json({ message: "Invalid master password" });
    }
    const state = await ensureState();
    const passwords = (state.passwords as any[]) ?? [];
    res.json({ passwords });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// Add new password
router.post("/inventory/passwords", async (req, res) => {
  try {
    const { masterPassword, label, password, permissions } = req.body;
    if (masterPassword !== MASTER_PASSWORD) {
      return res.status(401).json({ message: "Invalid master password" });
    }
    const state = await ensureState();
    const passwords = (state.passwords as any[]) ?? [];
    const newEntry = {
      id: crypto.randomUUID(),
      label: label || "User",
      password,
      permissions: permissions || { canSuggestLocations: true, canUploadPhotos: true },
      createdAt: Date.now(),
    };
    passwords.push(newEntry);
    await db.update(inventoryState).set({ passwords }).where(eq(inventoryState.id, 1));
    res.status(201).json({ message: "Password added", entry: newEntry });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// Delete password
router.delete("/inventory/passwords/:id", async (req, res) => {
  try {
    const { masterPassword } = req.body;
    if (masterPassword !== MASTER_PASSWORD) {
      return res.status(401).json({ message: "Invalid master password" });
    }
    const state = await ensureState();
    const passwords = ((state.passwords as any[]) ?? []).filter((p: any) => p.id !== req.params.id);
    await db.update(inventoryState).set({ passwords }).where(eq(inventoryState.id, 1));
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// Reset to new password (change main admin password)
router.put("/inventory/passwords/reset", async (req, res) => {
  try {
    const { masterPassword, id, newPassword } = req.body;
    if (masterPassword !== MASTER_PASSWORD) {
      return res.status(401).json({ message: "Invalid master password" });
    }
    const state = await ensureState();
    const passwords = ((state.passwords as any[]) ?? []).map((p: any) =>
      p.id === id ? { ...p, password: newPassword } : p
    );
    await db.update(inventoryState).set({ passwords }).where(eq(inventoryState.id, 1));
    res.json({ message: "Password updated" });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// ─── Pending changes ──────────────────────────────────────────────────────────
router.get("/inventory/pending", async (_req, res) => {
  try {
    const all = await db.select().from(pendingChanges);
    res.json(all.filter(r => r.status === "pending"));
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

router.post("/inventory/pending", async (req, res) => {
  try {
    const { type, partId, partNumber, oldValue, newValue, photoData, photoName } = req.body;
    const [inserted] = await db.insert(pendingChanges).values({
      type, partId, partNumber,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      photoData: photoData ?? null,
      photoName: photoName ?? null,
      submittedAt: Date.now(),
      status: "pending",
    }).returning();
    res.status(201).json(inserted);
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// Approve a pending change
router.post("/inventory/pending/:id/approve", async (req, res) => {
  try {
    const changeId = Number(req.params.id);
    const [change] = await db.select().from(pendingChanges).where(eq(pendingChanges.id, changeId));
    if (!change) return res.status(404).json({ message: "Not found" });

    const state = await ensureState();
    const parts = (state.parts as any[]) ?? [];

    if (change.type === "location") {
      // Apply location change
      const updatedParts = parts.map((p: any) =>
        p.id === change.partId ? { ...p, location: change.newValue, Location: change.newValue } : p
      );
      await db.update(inventoryState).set({ parts: updatedParts }).where(eq(inventoryState.id, 1));
    } else if (change.type === "photo") {
      // Apply photo
      const photoName = req.body.approvedName || change.photoName || "photo.jpg";
      const updatedParts = parts.map((p: any) => {
        if (p.id === change.partId) {
          return { ...p, images: [...(p.images || []), change.photoData] };
        }
        return p;
      });
      await db.update(inventoryState).set({ parts: updatedParts }).where(eq(inventoryState.id, 1));
      void photoName; // used by client for display
    }

    await db.update(pendingChanges).set({ status: "approved" }).where(eq(pendingChanges.id, changeId));
    res.json({ message: "Approved" });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// Reject / delete a pending change
router.delete("/inventory/pending/:id", async (req, res) => {
  try {
    const changeId = Number(req.params.id);
    await db.update(pendingChanges).set({ status: "rejected" }).where(eq(pendingChanges.id, changeId));
    res.json({ message: "Rejected" });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

export default router;
