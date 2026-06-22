// Pantalla de proyección (solo lectura). Se autorrefresca cada 3 segundos.
// Izquierda: puestos POR OFERTAR (al aceptarse, desaparecen de aquí).
// Derecha: ADJUDICADOS (quién se ha quedado cada contrato).

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
const $ = (id) => document.getElementById(id);

function fechas(p) {
  if (!p.fecha_inicio && !p.fecha_fin) return "";
  return `${esc(p.fecha_inicio)} – ${esc(p.fecha_fin)}`;
}

async function refrescar() {
  let d;
  try { d = await (await fetch("/api/estado")).json(); }
  catch (e) { return; }
  if (!d.ok) return;

  $("c-total").textContent = d.resumen.total;
  $("c-asig").textContent = d.resumen.adjudicados;
  $("c-pend").textContent = d.resumen.pendientes;
  $("hora").textContent = d.actualizado;

  const porOfertar = d.puestos.filter(p => !p.adjudicado);
  const adjudicados = d.puestos.filter(p => p.adjudicado);

  pintarPendientes(porOfertar);
  pintarAdjudicados(adjudicados);
}

// ----- Por ofertar: agrupado por centro, con "quedan N" -----
function pintarPendientes(lista) {
  if (!lista.length) {
    $("pendientes").innerHTML = '<p class="vacio">No quedan puestos por ofertar. 🎉</p>';
    return;
  }
  const grupos = {};
  lista.forEach(p => { const k = p.centro || "(Sin centro)"; (grupos[k] = grupos[k] || []).push(p); });

  $("pendientes").innerHTML = Object.keys(grupos).sort().map(centro => {
    const filas = grupos[centro].map(p => `
      <tr>
        <td>${p.id - 1}</td>
        <td>${fechas(p)}</td>
        <td>${esc(p.duracion)} d</td>
        <td>${esc(p.turno)}</td>
        <td>${p.estado && p.estado !== 'Pendiente' ? `<span class="pill" data-e="${esc(p.estado)}">${esc(p.estado)}</span>` : ''}</td>
      </tr>`).join("");
    return `<div class="grupo">
      <h3><span>${esc(centro)}</span> <span class="quedan">Quedan ${grupos[centro].length}</span></h3>
      <table>
        <thead><tr><th style="width:50px">#</th><th>Fechas</th><th>Días</th><th>Turno</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
  }).join("");
}

// ----- Adjudicados: lista con persona -----
function pintarAdjudicados(lista) {
  if (!lista.length) {
    $("adjudicados").innerHTML = '<p class="vacio">Aún no hay contratos aceptados.</p>';
    return;
  }
  const filas = lista.map(p => `
    <tr class="adj">
      <td>${p.id - 1}</td>
      <td>${esc(p.centro)}<br><span class="mini" style="color:#9fc3e8">${fechas(p)} · ${esc(p.turno)}</span></td>
      <td><b>${esc(p.asignado_a)}</b>${p.num_candidato ? `<br><span class="mini" style="color:#9fc3e8">nº ${esc(p.num_candidato)}</span>` : ''}</td>
    </tr>`).join("");
  $("adjudicados").innerHTML = `<table>
    <thead><tr><th style="width:50px">#</th><th>Contrato</th><th>Persona</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>`;
}

refrescar();
setInterval(refrescar, 3000);
