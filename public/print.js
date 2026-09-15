(function () {
  const opener = window.opener;
  const app = opener && opener.electionsPrintApp;
  const analysis = app && app.analysis;
  if (!app || !analysis) {
    document.body.innerHTML =
      '<p style="padding:40px;font:16px Marianne,Arial,sans-serif">' +
      "Cette page s’ouvre depuis le bouton « Imprimer la fiche » de l’Atlas électoral, une fois une unité sélectionnée." +
      "</p>";
    return;
  }

  const { unit, election, tourLabel, scale } = analysis;
  const scaleLabels = { commune: "Commune", bv: "Bureau de vote", canton: "Canton", circonscription: "Circonscription" };

  document.getElementById("printTitle").textContent = unit.nom;
  document.getElementById("printSubtitle").textContent = `${scaleLabels[scale] || scale} · ${election} · ${tourLabel}`;

  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  document.getElementById("printSources").innerHTML =
    `<span>Sources : Ministère de l'Intérieur, data.gouv.fr (agrégation Etalab), IGN</span><br/><span>Édité le ${today} — DDT 95</span>`;

  document.getElementById("printSide").innerHTML = `
    <div class="side-card">
      <h2>Participation</h2>
      <div class="side-row"><span>Inscrits</span><strong>${unit.inscrits.toLocaleString("fr-FR")}</strong></div>
      <div class="side-row"><span>Votants</span><strong>${unit.votants.toLocaleString("fr-FR")}</strong></div>
      <div class="side-row"><span>Abstention</span><strong>${unit.pct_abstention.toFixed(1)} %</strong></div>
      <div class="side-row"><span>Participation</span><strong>${unit.pct_participation.toFixed(1)} %</strong></div>
      <div class="side-row"><span>Blancs</span><strong>${unit.blancs.toLocaleString("fr-FR")}</strong></div>
      <div class="side-row"><span>Nuls</span><strong>${unit.nuls.toLocaleString("fr-FR")}</strong></div>
    </div>
  `;

  const rows = (unit.candidats || [])
    .map(
      (c, i) =>
        `<tr class="${i === 0 ? "lead" : ""}"><td>${c.prenom || ""} ${c.nom || ""}</td><td class="num">${c.voix.toLocaleString("fr-FR")}</td><td class="num">${c.pct_exprimes.toFixed(2)} %</td></tr>`,
    )
    .join("");
  document.getElementById("printTable").innerHTML = `
    <table>
      <thead><tr><th>Candidat / liste</th><th>Voix</th><th>% exprimés</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  const statusEl = document.getElementById("pdfStatus");
  async function buildPdf() {
    const node = document.getElementById("printPage");
    const canvas = await html2canvas(node, { scale: 2.2, useCORS: true, backgroundColor: "#ffffff" });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = 297,
      h = (canvas.height * w) / canvas.width;
    doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h, undefined, "FAST");
    const blobUrl = URL.createObjectURL(doc.output("blob"));
    window.location.replace(blobUrl);
  }
  setTimeout(() => {
    buildPdf().catch((err) => {
      console.error(err);
      statusEl.textContent = "La génération du PDF a échoué. Réessayez depuis la fiche.";
    });
  }, 500);
})();
