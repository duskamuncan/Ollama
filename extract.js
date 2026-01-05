import rdf from "rdflib";
import fs from "fs";

const store = rdf.graph();

const rdfData = fs.readFileSync(
  "EquipmentProfileCoreRDFSAugmented-v2_4_15-4Jul2016.rdf",
  "utf8"
);

rdf.parse(rdfData, store, "http://example.org", "application/rdf+xml");

let output = "";

store.statements.forEach(triple => {
  const subject = triple.subject.value;
  const predicate = triple.predicate.value;

  let object;
  if (triple.object.termType === "Literal") {
    object = triple.object.value;
  } else {
    object = triple.object.value;
  }

  //output += `${subject} ${predicate} ${object}\n`;
  output += `${subject}\t${predicate}\t${object}\n`;

});

fs.writeFileSync("triples.txt", output, "utf8");
console.log("Triples successfully written to triples.txt");
