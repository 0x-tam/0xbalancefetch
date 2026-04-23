import express from "express";
import path from "path";
import fs from "fs";

const app  = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const OUTPUT_DIR = path.resolve(process.cwd(), "data/output");
const PUBLIC_DIR = path.resolve(__dirname, "public");

// Serve the HTML viewer
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Serve snapshot data as JSON API
app.get("/api/snapshot", (_req, res) => {
  const filePath = path.join(OUTPUT_DIR, "snapshot_full.json");
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "No snapshot data found. Run `npm run seed` or `npm run snapshot` first." });
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to parse snapshot_full.json" });
  }
});

app.listen(PORT, () => {
  console.log(`Viewer running at http://localhost:${PORT}`);
});
