import fs from "fs";
import path from "path";

import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { OllamaEmbeddings, ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
//import { QueryEngine } from "@comunica/query-sparql";

import { QueryEngine } from "@comunica/query-sparql-file";
import { pathToFileURL } from "url";


const FAISS_PATH = "faiss-db";
const SEARCH_K = 170; 

const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
const model = new ChatOllama({ model: "gemma3:1b", temperature: 0.1 });

const SPARQL_PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX cim: <http://iec.ch/TC57/2013/CIM-schema-cim16#>
`;

const sparqlTemplatePrompt = new SystemMessage(`
SPECIAL MODE — SPARQL GENERATION (STRICT)

OUTPUT:
- Use ONLY given templates, with classes from question
- Replace imeKlase with given class name and add cim namespace in front of class name
- Replace imeKlase.property with given class and property name. After that always write ?value.
- rdf:type must be used and can't be changed
- ?value must be used and can't be changed 
- The (MAX(?value) AS ?maxValue) can't be changed
- Use FILTER instead of '='
- Do NOT add explanation, markdown, or extra text
- Before every query, use this prefixes:
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX cim: <http://iec.ch/TC57/2013/CIM-schema-cim16#>

TEMPLATES:

# 1) All instances of a class
SELECT ?instance ?name ?description WHERE { ?instance rdf:type imeKlase . OPTIONAL { ?instance cim:IdentifiedObject.name ?name } OPTIONAL { ?instance cim:IdentifiedObject.description ?description } }

# 2) All connected elements via ConnectivityNode and Terminal
SELECT ?source ?connected WHERE {
  ?source rdf:type cim:ConductingEquipment .
  ?source cim:Terminal ?terminal1 .
  ?terminal1 cim:ConnectivityNode ?node .

  ?connected rdf:type cim:ConductingEquipment .
  ?connected cim:Terminal ?terminal2 .
  ?terminal2 cim:ConnectivityNode ?node .

}

# 3) Maximum value of a property of instances 
SELECT (MAX(?value) AS ?maxValue) WHERE { ?instance rdf:type cim:imeKlase . ?instance cim:imeKlase.property ?value  }
`);


function shouldGenerateSparql(question) {
  return [
    "write a sparql",
    "generate a sparql",
    "sparql query for",
  ].some(t => question.toLowerCase().includes(t));
}


async function getContextFromFaiss(question) {
  const store = await FaissStore.load(FAISS_PATH, embeddings);
  const results = await store.similaritySearch(question, SEARCH_K);

  return results
    .map(r => r.pageContent?.trim())
    .filter(Boolean)
    .join("\n\n");
}


async function generateAnswer(context, question) {
  const msg = new HumanMessage(`
You are answering STRICTLY from the provided CIM context.

Rules:
- Use ONLY the context below.
- Write whole descriprion.
- If the concept is NOT present, say exactly:
  "Concept not found in FAISS knowledge base."

CIM CONTEXT:
${context}

QUESTION:
${question}
`);

  const response = await model.invoke([msg]);
  return response.content.trim();
}


async function generateSparqlQuery(question) {
  const msg = new HumanMessage(question);
  const response = await model.invoke([sparqlTemplatePrompt, msg]);

  let sparql = response.content.trim();

  sparql = sparql.replace(/```sparql/gi, "");
  sparql = sparql.replace(/```/g, "");
  sparql = sparql.replace(/^sparql\s+/i, "");
  sparql = sparql.replace(/PREFIX\s+\w+:.*\n/gi, "").trim();

  return sparql.trim();
}


async function executeSparqlQuery(sparqlQuery, entsoeFilePath) {
  const engine = new QueryEngine();
  const fileUrl = pathToFileURL(path.resolve(entsoeFilePath)).href;

  const PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX cim: <http://iec.ch/TC57/2013/CIM-schema-cim16#>
`;
  //const sparqlQuery1 = "SELECT ?junction ?terminal ?node WHERE { ?junction rdf:type cim:Junction . ?terminal cim:Terminal.ConductingEquipment ?junction . ?terminal cim:Terminal.ConnectivityNode ?node . }";
  const finalQuery =
    sparqlQuery.includes("PREFIX rdf:")
      ? sparqlQuery
      : PREFIXES + "\n" + sparqlQuery;

  console.log("Final SPARQL sent to parser:\n", finalQuery);

  const result = await engine.query(finalQuery, {
    sources: [
      {
        type: "file",
        value: fileUrl,
        baseIRI: fileUrl
      }
    ],
  });

  const bindingsStream = await result.execute();
  const rows = [];

  return new Promise((resolve, reject) => {
    bindingsStream.on("data", (binding) => {
      const row = {};
      for (const key of binding.keys()) {
        const keyStr = key.value ?? String(key); 
        row[keyStr.replace("?", "")] = binding.get(key)?.value ?? null;
      }
      rows.push(row);
    });

    bindingsStream.on("end", () => resolve(rows));
    bindingsStream.on("error", (err) => {
      console.error("Error in bindingsStream:", err);
      reject(err);
    });
  });
}

export async function runRag(question, entsoeFilePath) {
  const mode = shouldGenerateSparql(question) ? "MODE_2" : "MODE_1";

  if (mode === "MODE_1") {
    const cimContext = await getContextFromFaiss(question);
    const answer = await generateAnswer(cimContext, question);
    return { mode, answer };
  }

  let sparqlQuery = '';
  sparqlQuery = await generateSparqlQuery(question);
  if (!sparqlQuery.trim()) {
    throw new Error("Generated SPARQL is empty. Cannot execute query.");
  }
  const results = await executeSparqlQuery(sparqlQuery, entsoeFilePath);

  return {
    mode,
    sparql: sparqlQuery,
    result: results,
  };
}
