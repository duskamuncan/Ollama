/*import fs from "fs";
import { OllamaEmbeddings } from "@langchain/ollama";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";


const rawText = fs.readFileSync("tripleti.txt", "utf-8");

let tripletLines = rawText
  .split("\n")
  .map(l => l.trim())
  .filter(l => l.length > 0 && !l.startsWith("#")); 

console.log("Broj tripleta:", tripletLines.length);

// embedding 
const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
});

// faiss baza
const vectorStore = await FaissStore.fromTexts([], [], embeddings);

const docs = tripletLines.map(line => {
  return new Document({
    pageContent: line,
    metadata: {},
  });
});

console.log("Ukupno dokumenata:", docs.length);

const BATCH_SIZE = 100;

console.log("Startujem batch embedding...");

for (let i = 0; i < docs.length; i += BATCH_SIZE) {
  const batch = docs.slice(i, i + BATCH_SIZE);

  console.log(
    `Embedding batch ${i / BATCH_SIZE + 1} / ${Math.ceil(docs.length / BATCH_SIZE)}`
  );

  await vectorStore.addDocuments(batch);
}

console.log("Čuvam FAISS bazu...");
await vectorStore.save("faiss-db");

console.log("FAISS baza uspešno kreirana i sačuvana!");
*/

import fs from "fs";
import { OllamaEmbeddings } from "@langchain/ollama";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";

//1. full namespace
//2. skraceni napemspace
//3. bez namespace

function simplifyURI(uri) {
  return uri
    .replace(/<|>/g, "")
    .replace("http://iec.ch/TC57/2013/CIM-schema-cim16#", "")
    .replace("http://iec.ch/TC57/1999/rdf-schema-extensions-19990926#", "cims:")
    .replace("http://www.w3.org/2000/01/rdf-schema#", "rdfs:")
    .replace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf:")
    .replace("http://iec.ch/TC57/NonStandard/UML#", "uml:")
    .trim();
}


function expandTriplet(subject, predicate, object) {
  return `
ENTITY: ${subject}
PROPERTY: ${predicate}
VALUE: ${object}

Meaning: ${subject} has property '${predicate}' with value '${object}'.
`;
}


const raw = fs.readFileSync("tripleti.txt", "utf8");

let lines = raw
  .split("\n")
  .map(l => l.trim())
  .filter(l => l.length > 0 && !l.startsWith("#"));

console.log("Broj tripleta:", lines.length);


const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
});


const vectorStore = await FaissStore.fromTexts([], [], embeddings);

let docs = [];

for (let line of lines) {

  const match = line.match(/^(<.+?>)\s+(<.+?>)\s+(.+?)\s*\.$/);

  if (!match) continue;

  let [_, subjRaw, predRaw, objRaw] = match;

  const subj = simplifyURI(subjRaw);
  const pred = simplifyURI(predRaw);

  let obj = objRaw;
  if (obj.startsWith("<")) obj = simplifyURI(obj); 
  else obj = obj.replace(/"/g, "");               

  
  const text = `
${subj} — ${pred} — ${obj}
${expandTriplet(subj, pred, obj)}
  `;

  docs.push(
    new Document({
      pageContent: text.toLowerCase(), 
      metadata: { subject: subj }
    })
  );
}

console.log("Ukupno dokumenata nakon obrade:", docs.length);

const BATCH_SIZE = 100;
console.log("Startujem batch embedding...");

for (let i = 0; i < docs.length; i += BATCH_SIZE) {
  const batch = docs.slice(i, i + BATCH_SIZE);

  console.log(
    `Embedding batch ${i / BATCH_SIZE + 1} / ${Math.ceil(docs.length / BATCH_SIZE)}`
  );

  await vectorStore.addDocuments(batch);
}

console.log("Čuvam FAISS bazu...");
await vectorStore.save("faiss-db");

console.log("FAISS baza uspešno kreirana i sačuvana!");
