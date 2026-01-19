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
const model = new ChatOllama({ model: "gemma3:1b", temperature: 0.0 });

const SPARQL_PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX cim: <http://iec.ch/TC57/2013/CIM-schema-cim16#>
`;

const sparqlTemplatePrompt = new SystemMessage(`
SPECIAL MODE — SPARQL GENERATION (STRICT)

OUTPUT:
- Use ONLY given templates, with classes from question
- Use FILTER instead of '='
- Do NOT add explanation, markdown, or extra text
- Before every query, use this prefixes:
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX cim: <http://iec.ch/TC57/2013/CIM-schema-cim16#>

TEMPLATES:

# 1) All instances of a class
SELECT ?instance WHERE { ?instance rdf:type cim:ClassName . }

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
SELECT (MAX(?value) AS ?maxValue) WHERE {
  ?instance rdf:type cim:ClassName .
  ?instance cim:propertyName ?value .
}
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

  console.log("Final SPARQL sent to parser:\n", sparql);
  return (SPARQL_PREFIXES + "\n" + sparql).trim();
}


async function executeSparqlQuery(sparqlQuery, entsoeFilePath) {
  const engine = new QueryEngine();

  const filePath = path.resolve(entsoeFilePath);

  const result = await engine.queryBindings(sparqlQuery, {
    sources: [
      { type: "file", value: filePath } 
    ],
  });

  const bindings = await result.toArray();

  return bindings.map(b => {
    const row = {};
    for (const [key, value] of b.entries()) {
      row[key] = value.value;
    }
    return row;
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
