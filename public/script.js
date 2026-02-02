
document.getElementById("askBtn").addEventListener("click", async () => {
  const askBtn = document.getElementById("askBtn");
  const answerDiv = document.getElementById("answer");

  const question = document.getElementById("questionInput").value;
  const fileName = document.getElementById("fileInput").value.split("\\").pop(); 

  if (!question || !fileName) {
    alert("Ask question and choose ENTSO-E file.");
    return;
  }

  askBtn.disabled = true;
  askBtn.textContent = "Generating...";
  answerDiv.innerHTML = "<p>⏳ Generating answer, please wait...</p>";

  try {
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

        <h3>Result of executed SPARQL</h3>
        <pre>${JSON.stringify(answer.result, null, 2)}</pre>
      `;
    }

    answerDiv.innerHTML = html;
  } catch (err) {
    console.error(err);
    answerDiv.innerHTML = "<p style='color:red'>Error generating answer.</p>";
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "Ask";
  }
});
