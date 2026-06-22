// Pantalla de proyección (solo lectura). Se autorrefresca cada 3 segundos.

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

async function refrescar() {
  let d;
  try { d = await (await fetch("/api/estado")).json(); }
  catch (e) { return; }
  if (!d.ok) return;

  $("c-total").textContent = d.resumen.total;
  $("c-asig").textContent = d.resumen.asignados;
  $("c-pend").textContent = d.resumen.pendientes;
  $("hora").textContent = d.actualizado;

  // Agrupa los puestos por centro.
  const grupos = {};
  d.puestos.forEach(p => {
    const k = p.centro || "(Sin centro)";
    (grupos[k] = grupos[k] || []).push(p);
  });

  const html = Object.keys(grupos).sort().map(centro => {
    const filas = grupos[centro].map(p => `
      <tr class="${p.asignado_a ? 'asignado' : ''}">
        <td>${p.id - 1}</td>
        <td>${esc(p.duracion)}</td>
        <td>${esc(p.turno)}</td>
        <td>${p.asignado_a ? `<b>${esc(p.asignado_a)}</b>${p.num_candidato ? ` (nº ${esc(p.num_candidato)})` : ''}` : '—'}</td>
        <td><span class="pill" data-e="${esc(p.estado)}">${esc(p.estado)}</span></td>
      </tr>`).join("");
    const asig = grupos[centro].filter(p => p.asignado_a).length;
    return `<div class="grupo-centro">
      <h2>${esc(centro)} <span class="mini" style="color:#9fc3e8">· ${asig}/${grupos[centro].length} asignados</span></h2>
      <table>
        <thead><tr><th style="width:60px">#</th><th>Duración</th><th>Turno</th><th>Persona asignada</th><th style="width:160px">Estado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
  }).join("");

  $("contenedor").innerHTML = html || '<p style="font-size:22px">No hay puestos cargados.</p>';
}

refrescar();
setInterval(refrescar, 3000);
