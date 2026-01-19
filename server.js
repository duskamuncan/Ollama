
import express from "express";
import fs from "fs";
import path from "path";
import { runRag } from "./rag.js";

const app = express();

app.use(express.json());
app.use(express.static("public"));

app.post("/ask", async (req, res) => {
  try {
    const { question, fileName } = req.body;
    if (!question || !fileName) {
      return res.status(400).json({ error: "Missing question or fileName" });
    }

    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: "File does not exist" });
    }

    const answer = await runRag(question, filePath);

    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error while processing question" });
  }
});

app.listen(3000, () => {
  console.log("UI running on http://localhost:3000");
});