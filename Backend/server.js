const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// In-memory store
const cases = {};

// Create a new forensic case
app.post("/api/cases", (req, res) => {
  const caseId = Date.now().toString();
  cases[caseId] = { results: null };
  res.json({ caseId });
});

// Upload results for a case
app.post("/api/cases/:caseId/results", (req, res) => {
  const { caseId } = req.params;
  if (!cases[caseId]) return res.status(404).json({ error: "Case not found" });
  cases[caseId].results = req.body;
  res.json({ success: true });
});

// Get results for a case
app.get("/api/cases/:caseId/results", (req, res) => {
  const { caseId } = req.params;
  if (!cases[caseId]) return res.status(404).json({ error: "Case not found" });
  res.json(cases[caseId].results || null);
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
