
import fs from "fs";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { OllamaEmbeddings, ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, Annotation, messagesStateReducer, START, END } from "@langchain/langgraph";
import { XMLParser } from "fast-xml-parser";

const FAISS_PATH = "faiss-db";
const SEARCH_K = 8;

const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });

const modelLowTemp = new ChatOllama({
  model: "gemma3:1b",
  temperature: 0.1,
});

const modelHighTemp = new ChatOllama({
  model: "gemma3:1b",
  temperature: 0.5,
});

const annotation = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  user_query: Annotation(),
  cim_context: Annotation(),
  entsoe_string: Annotation(),
  sparql_query: Annotation(),
  sparql_explanation: Annotation(),
  extraction_result: Annotation(),
});


const generatePrompt = new SystemMessage(`
You are a CIM/CGMES SPARQL generator.

RULES:
1. Use ONLY classes and properties that appear in the CIM CONTEXT.
2. Use the EXACT names as found in the CIM context (e.g. BaseVoltage, BaseVoltage.nominalVoltage, rdfs:label, rdf:type).
3. Output ONLY SPARQL (no explanations).

If a SPARQL query cannot be generated from the available CIM context,
output EXACTLY:
SPARQL cannot be generated from available CIM context.
`);

const explainPrompt = new SystemMessage(`
Explain the SPARQL query in 3–6 clear sentences.
Use the CIM context as reference.
Use provided comments to explain meaning of class.
Do not add extra information.
`);

const extractionPrompt = new SystemMessage(`
You are an ENTSO-E CGMES expert reading raw RDF/XML.

TASK:
- You are given a SPARQL query and ENTSO-E RDF/XML data.
- Extract ONLY elements that MATCH the SPARQL pattern (class/property names from SPARQL).
- Do NOT hallucinate or invent data.

RULES:
- If no match exists, return: { "matches": [], "count": 0, "targetClass": "<class_from_sparql>" }.
- Output JSON only, do NOT include text explanations.
`);

async function generateSparql(state) {
  const userMsg = new HumanMessage(`
CIM CONTEXT:
${state.cim_context}

QUESTION:
${state.user_query}

Task:
- Construct a valid SPARQL query using class/property names from CIM ontology.

Output only SPARQL.
`);

  const messages = [generatePrompt, ...state.messages, userMsg];
  const res = await modelLowTemp.invoke(messages);

  let sparql = (res.content || "").trim();
  sparql = sparql.replace(/^```(sparql)?/i, "").replace(/```$/, "").trim();

  return {
    sparql_query: sparql,
    messages: [userMsg, res],
  };
}

async function explainSparql(state) {
  const msg = new HumanMessage(`
SPARQL:
${state.sparql_query}

CIM CONTEXT (informative):
${state.cim_context}

Explain the SPARQL query clearly in 3–6 sentences.
`);

  const messages = [explainPrompt, ...state.messages, msg];
  const res = await modelHighTemp.invoke(messages);

  return {
    sparql_explanation: res.content || "",
    messages: [msg, res],
  };
}

async function extractFromEntsoe(state) {
  if (!state.sparql_query || state.sparql_query.startsWith("SPARQL cannot")) {
    return {
      extraction_result: {
        matches: [],
        count: 0,
        targetClass: null,
      },
      messages: [],
    };
  }

  const sparql = state.sparql_query;
  let targetClass = null;

  const classMatch = sparql.match(/\?(\w+)/);
  if (classMatch) targetClass = classMatch[1];

  const parser = new XMLParser({ ignoreAttributes: false });
  let xmlObj;
  try {
    xmlObj = parser.parse(state.entsoe_string);
  } catch {
    return {
      extraction_result: { error: "Invalid XML provided." },
      messages: [],
    };
  }

  function findInstances(obj, className) {
    let results = [];
    if (typeof obj !== "object" || obj === null) return results;

    for (const key of Object.keys(obj)) {
      if (key.toLowerCase().includes(className.toLowerCase())) {
        const value = Array.isArray(obj[key]) ? obj[key] : [obj[key]];
        results.push(...value);
      } else if (typeof obj[key] === "object") {
        results.push(...findInstances(obj[key], className));
      }
    }
    return results;
  }

  const matches = targetClass ? findInstances(xmlObj, targetClass) : [];

  return {
    extraction_result: {
      targetClass,
      count: matches.length,
      matches,
    },
    messages: [],
  };
}


const graph = new StateGraph(annotation)
  .addNode("generate_sparql", generateSparql)
  .addNode("explain_sparql", explainSparql)
  .addNode("extract_from_entsoe", extractFromEntsoe)
  .addEdge(START, "generate_sparql")
  .addEdge("generate_sparql", "explain_sparql")
  .addEdge("explain_sparql", "extract_from_entsoe")
  .addEdge("extract_from_entsoe", END)
  .compile();


export async function runRag(question, entsoeFilePath) {
  const store = await FaissStore.load(FAISS_PATH, embeddings);
  const normalizedQuestion = question.toLowerCase().replace(/[^a-z0-9]/g, " ");
  const results = await store.similaritySearch(normalizedQuestion, SEARCH_K);
  const cimContext = results.map(r => r.pageContent).join("\n");

  const entsoeString = fs.readFileSync(entsoeFilePath, "utf-8");

  const out = await graph.invoke({
    user_query: question,
    cim_context: cimContext,
    entsoe_string: entsoeString,
  });

  return {
    sparql: out.sparql_query,
    explanation: out.sparql_explanation,
    extraction: out.extraction_result,
  };
}
