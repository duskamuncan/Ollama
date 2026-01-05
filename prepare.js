import fs from "fs";
import { OllamaEmbeddings } from "@langchain/ollama";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";

function localName(uri) {
  return uri.split("#").pop().split("/").pop();
}

const raw = fs.readFileSync("triples.txt", "utf8");
const lines = raw
  .split("\n")
  .map(l => l.trim())
  .filter(Boolean);

const concepts = {};

for (const line of lines) {
  const parts = line.split("\t");
  if (parts.length < 3) continue;

  const [s, p, ...oParts] = parts;
  const o = oParts.join(" ").trim();

  if (!s || !p || !o) continue;

  const subject = localName(s);
  const predicate = localName(p);
  const object = o.startsWith("http") ? localName(o) : o;

  if (!concepts[subject]) {
    concepts[subject] = {
      comment: null,
      properties: new Set()
    };
  }

  if (predicate === "comment" || predicate === "description" || predicate === "label") {
    concepts[subject].comment = object;
  }

  if (predicate.includes(".")) {
    const prop = predicate.split(".").pop();
    concepts[subject].properties.add(prop);
  }
}

const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
});

const vectorStore = await FaissStore.fromTexts([], [], embeddings);

const docs = [];

for (const [name, data] of Object.entries(concepts)) {
  let text = `Concept: ${name}\n`;

  if (data.comment) {
    text += `Description: ${data.comment}\n`;
  }

  if (data.properties.size > 0) {
    text += "Properties:\n";
    for (const p of data.properties) {
      text += `- ${p}\n`;
    }
  }

  docs.push(
    new Document({
      pageContent: text.toLowerCase(),
      metadata: { concept: name }
    })
  );
}

console.log("Concepts for FAISS:", docs.length);

await vectorStore.addDocuments(docs);
await vectorStore.save("faiss-db");

console.log("FAISS base successfully created!");
