document.getElementById("askBtn").addEventListener("click", async () => {
  const question = document.getElementById("questionInput").value;
  const fileInput = document.getElementById("fileInput").files[0];

  if (!question || !fileInput) {
    alert("Ask question and choose ENTSO-E file.");
    return;
  }

  const formData = new FormData();
  formData.append("question", question);
  formData.append("file", fileInput);

  const res = await fetch("/ask", {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  const answer = data.answer;

  document.getElementById("answer").innerHTML = `
    <h3>SPARQL</h3>
    <pre>${answer.sparql}</pre>

    <h3>Explanation</h3>
    <p>${answer.explanation}</p>

    <h3>Extraction</h3>
    <pre>${JSON.stringify(answer.extraction, null, 2)}</pre>
  `;
});
