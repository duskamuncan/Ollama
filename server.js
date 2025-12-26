import express from "express";
import multer from "multer";
import fs from "fs";
import { runRag } from "./rag.js";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

app.post("/ask", upload.single("file"), async (req, res) => {
  try {
    const question = req.body.question;
    const filePath = req.file.path;

    const answer = await runRag(question, filePath);

    // Obrisati fajl odmah nakon što se obradi
    fs.unlinkSync(filePath);

    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error while processing question" });
  }
});

app.listen(3000, () => {
  console.log("UI running on http://localhost:3000");
});
