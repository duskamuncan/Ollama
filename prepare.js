import fs from "fs";
import { OllamaEmbeddings } from "@langchain/ollama";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";

const rawText = fs.readFileSync("doubles.txt", "utf-8");

const conceptBlocks = rawText
  .split("\n\n")
  .map(b => b.trim())
  .filter(b => b.length > 0);

console.log("Number of concepts:", conceptBlocks.length);

const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
});

const vectorStore = await FaissStore.fromTexts([], [], embeddings);

const docs = conceptBlocks.map(block => {
  const match = block.match(/^Concept:\s*(.+)$/m);
  const conceptName = match ? match[1].trim() : "Unknown";

  return new Document({
    pageContent: block,      
    metadata: {
      concept: conceptName,  
      source: "rdf",
    },
  });
});

console.log("Number of documents:", docs.length);

const BATCH_SIZE = 50;

console.log("Starting batch embedding...");

for (let i = 0; i < docs.length; i += BATCH_SIZE) {
  const batch = docs.slice(i, i + BATCH_SIZE);

  console.log(
    `Embedding batch ${i / BATCH_SIZE + 1} / ${Math.ceil(docs.length / BATCH_SIZE)}`
  );

  await vectorStore.addDocuments(batch);
}

console.log("Saving FAISS ...");
await vectorStore.save("faiss-db");

console.log("FAISS successfully created and saved!");
