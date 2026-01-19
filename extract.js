import rdf from 'rdflib';
import fs from 'fs';

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

function getLocalName(uri) {
  if (!uri) return '';
  if (uri.includes('#')) return uri.split('#').pop();
  return uri.split('/').pop();
}

const classes = new Set();

store.statements.forEach(st => {
  const predicate = getLocalName(st.predicate.value);
  const object = getLocalName(st.object.value);

  if (
    predicate === 'type' &&
    (object === 'Class' || object === 'OntologyClass')
  ) {
    classes.add(st.subject.value);
  }
});

let output = '';

store.statements.forEach(st => {
  if (!classes.has(st.subject.value)) return;

  const predicate = getLocalName(st.predicate.value);

  if (predicate !== 'comment') return;

  const className = getLocalName(st.subject.value);
  const description = st.object.value.trim();

  output += `Concept: ${className}\n`;
  output += `Description: ${description}\n\n`;
});

fs.writeFileSync('doubles.txt', output, 'utf8');

console.log('Concepts saved in doubles.txt');
