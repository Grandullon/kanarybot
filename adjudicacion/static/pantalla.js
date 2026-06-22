// Pantalla de proyección (solo lectura). Se autorrefresca cada 3 segundos.
// Izquierda: TABLÓN "por ofertar" por centro, con fichas verde=libre / rojo=dada.
// Derecha:   FEED "se va cogiendo (por orden)", lo más reciente arriba.

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function fechas(p) {
  if (!p.fecha_inicio && !p.fecha_fin) return "";
  return `${esc(p.fecha_inicio)} – ${esc(p.fecha_fin)}`;
}
function claveCentro(c) { return (c || "(Sin centro)").trim().toLowerCase().replace(/\s+/g, " "); }
function hhmm(h) { return h ? String(h).slice(0, 5) : ""; }
// Duración robusta: vacío -> ""; si es número -> "N días"; si es texto -> tal cual.
function dur(p) {
  const v = String(p.duracion == null ? "" : p.duracion).trim();
  if (!v) return "";
  return /^\d+$/.test(v) ? `${v} días` : v;
}

let vistos = null;  // ids de adjudicados ya mostrados (para resaltar los nuevos)

async function refrescar() {
  let d;
  try { d = await (await fetch("/api/estado")).json(); }
  catch (e) { return; }
  if (!d.ok) return;

  $("c-total").textContent = d.resumen.total;
  $("c-asig").textContent = d.resumen.adjudicados;
  $("c-pend").textContent = d.resumen.pendientes;
  $("hora").textContent = d.actualizado;
  const pct = d.resumen.total ? (d.resumen.adjudicados / d.resumen.total * 100) : 0;
  $("barra").style.width = pct + "%";

  pintarTablon(d.puestos);
  pintarFeed(d.puestos.filter(p => p.adjudicado));
}

// ----- Tablón "por ofertar": todos los puestos, agrupados centro -> tipo -----
function pintarTablon(puestos) {
  if (!puestos.length) {
    $("pendientes").innerHTML = '<p class="vacio">No hay puestos cargados.</p>';
    return;
  }
  // Agrupa por centro (normalizando mayúsculas/espacios) y, dentro, por tipo de contrato.
  const centros = {};
  puestos.forEach(p => {
    const k = claveCentro(p.centro);
    const c = centros[k] || (centros[k] = { nombre: (p.centro || "(Sin centro)").trim(), tipos: {}, quedan: 0, total: 0 });
    const tk = `${p.duracion}|${p.fecha_inicio}|${p.fecha_fin}|${p.turno}`;
    const t = c.tipos[tk] || (c.tipos[tk] = { p, libres: 0, dadas: 0 });
    c.total++;
    if (p.adjudicado) { t.dadas++; } else { t.libres++; c.quedan++; }
  });

  // Ordena: primero centros con plazas libres, luego agotados; alfabético.
  const orden = Object.values(centros).sort((a, b) =>
    (a.quedan === 0) - (b.quedan === 0) || a.nombre.localeCompare(b.nombre));

  if (orden.every(c => c.quedan === 0)) {
    $("pendientes").innerHTML = '<p class="vacio">No quedan puestos por ofertar. 🎉</p>'
      + orden.map(tarjetaCentro).join("");
    return;
  }
  $("pendientes").innerHTML = orden.map(tarjetaCentro).join("");
}

function tarjetaCentro(c) {
  const tipos = Object.values(c.tipos).map(t => {
    const p = t.p;
    const fichas = '<span class="ficha libre"></span>'.repeat(t.libres)
                 + '<span class="ficha dada"></span>'.repeat(t.dadas);
    const det = [fechas(p), p.turno].filter(Boolean).map(esc).join(" · ");
    return `<div class="tipo">
        <div class="desc"><b>${esc(dur(p))}</b>${det ? `<div class="det">${det}</div>` : ""}</div>
        <div class="fichas">${fichas}</div>
        <div class="cuenta">Quedan <b>${t.libres}</b> de ${t.libres + t.dadas}</div>
      </div>`;
  }).join("");
  const badge = c.quedan > 0
    ? `<span class="quedan-grande">Quedan <b>${c.quedan}</b></span>`
    : `<span class="quedan-grande cero">Completo</span>`;
  return `<div class="centro ${c.quedan === 0 ? "agotado" : ""}">
      <div class="cabc"><span class="nomc">${esc(c.nombre)}</span>${badge}</div>
      ${tipos}
    </div>`;
}

// ----- Feed "se va cogiendo": adjudicados, lo más reciente arriba -----
function pintarFeed(lista) {
  $("cuantos").textContent = lista.length ? `(${lista.length})` : "";
  if (!lista.length) {
    $("adjudicados").innerHTML = '<p class="vacio">Aún no se ha cogido ningún contrato.</p>';
    vistos = new Set();
    return;
  }
  // Orden cronológico por hora (HH:MM:SS); lo más reciente arriba.
  const orden = lista.slice().sort((a, b) =>
    String(b.hora).localeCompare(String(a.hora)) || (b.id - a.id));

  // La primera carga no debe destellar todo; a partir de ahí, resalta lo nuevo.
  const primera = vistos === null;
  if (primera) vistos = new Set();

  const html = orden.map(p => {
    const nuevo = !primera && !vistos.has(p.id);
    const contrato = [p.centro, dur(p), fechas(p)].filter(Boolean).map(esc).join(" · ");
    return `<div class="item ${nuevo ? "nuevo" : ""}">
        <span class="hora">${esc(hhmm(p.hora))}</span>
        <span class="nc">Nº${esc(p.num_candidato)}</span>
        <span class="quien">
          <span class="nom">${esc(p.nombre_pila || p.asignado_a)}</span>
          <span class="contr">${contrato}</span>
        </span>
      </div>`;
  }).join("");
  $("adjudicados").innerHTML = html;
  vistos = new Set(orden.map(p => p.id));
}

refrescar();
setInterval(refrescar, 3000);
