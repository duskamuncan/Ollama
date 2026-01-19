document.getElementById("askBtn").addEventListener("click", async () => {
  const question = document.getElementById("questionInput").value;
  const fileName = document.getElementById("fileInput").value.split("\\").pop(); // uzimamo ime fajla iz file inputa

  if (!question || !fileName) {
    alert("Ask question and choose ENTSO-E file.");
    return;
  }

  const res = await fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      fileName
    })
  });

  const data = await res.json();
  const answer = data.answer;

  let html = "";

  if (answer.mode === "MODE_1") {
    html += `
      <h3>Explanation</h3>
      <p>${answer.answer}</p>
    `;
  }

  if (answer.mode === "MODE_2") {
    html += `
      <h3>SPARQL</h3>
      <pre>${answer.sparql}</pre>

      <h3>Extraction</h3>
      <pre>${JSON.stringify(answer.result, null, 2)}</pre>
    `;
  }

  document.getElementById("answer").innerHTML = html;
});
