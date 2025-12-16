import rdf from 'rdflib';
import fs from 'fs';

// graf
const store = rdf.graph();

const rdfData = fs.readFileSync(
  'EquipmentProfileCoreRDFSAugmented-v2_4_15-4Jul2016.rdf',
  'utf8'
);


rdf.parse(
  rdfData,
  store,
  'http://example.org',        
  'application/rdf+xml'        
);

// triple format
let output = "";

store.statements.forEach(triple => {
  const subject = `<${triple.subject.value}>`;
  const predicate = `<${triple.predicate.value}>`;

  let object;
  if (triple.object.termType === "Literal") {
    object = JSON.stringify(triple.object.value);
  } else {
    object = `<${triple.object.value}>`;
  }

  output += `${subject} ${predicate} ${object} .\n`;
});

fs.writeFileSync('tripleti.txt', output, 'utf8');

console.log("Tripleti uspešno upisani u tripleti.txt");
