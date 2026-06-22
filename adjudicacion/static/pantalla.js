// Pantalla de proyección (solo lectura). Se autorrefresca cada 3 segundos.
// Izquierda: TABLÓN "por ofertar" por centro (barra + "X de Y", urgencia, duración humana).
// Derecha:   "LO COGIDO" — banner del último, contadores por centro y feed numerado.
// Pensada para proyector sin ratón: ambas columnas se auto-desplazan solas.

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function claveCentro(c) { return (c || "(Sin centro)").trim().toLowerCase().replace(/\s+/g, " "); }
function hhmm(h) { return h ? String(h).slice(0, 5) : ""; }

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function parseFecha(f) {
  const m = String(f || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  return { d: +m[1], mes: +m[2], y: +m[3] };
}
// Duración en lenguaje natural: número de días -> "N meses"/"1 mes"; texto -> tal cual.
function mesesHumano(p) {
  const v = String(p.duracion == null ? "" : p.duracion).trim();
  if (!v) return "";
  if (!/^\d+$/.test(v)) return v;                 // ya viene como texto ("2 meses")
  const meses = Math.max(1, Math.round(+v / 30));
  return meses === 1 ? "1 mes" : `${meses} meses`;
}
// Rango de meses a partir de las fechas: "jul–ago" (añade año si difiere).
function rangoMeses(p) {
  const a = parseFecha(p.fecha_inicio), b = parseFecha(p.fecha_fin);
  if (!a || !b) return "";
  const ma = MESES[a.mes - 1] || "", mb = MESES[b.mes - 1] || "";
  if (!ma || !mb) return "";
  if (a.y !== b.y) return `${ma} ${a.y} – ${mb} ${b.y}`;
  return ma === mb ? ma : `${ma}–${mb}`;
}
function turnoIcon(t) {
  const n = (t || "").toLowerCase();
  if (/noche|nocturn/.test(n)) return "🌙";
  if (/tarde/.test(n)) return "🌇";
  if (/rotat/.test(n)) return "🔄";
  if (/diurn|mañana|manana|dia|día/.test(n)) return "☀️";
  return "";
}
// Fechas completas: "01/07/2026 – 30/08/2026" (o la que haya).
function fechasFull(p) {
  const a = (p.fecha_inicio || "").trim(), b = (p.fecha_fin || "").trim();
  if (a && b) return `${a} – ${b}`;
  return a || b || "";
}
// Turno con icono: "☀️ Diurno" (o "").
function turnoTxt(p) {
  const t = (p.turno || "").trim();
  if (!t) return "";
  const ic = turnoIcon(t);
  return ic ? `${ic} ${t}` : t;
}

let vistos = null;       // ids de adjudicados ya mostrados (resaltar nuevos)
let ultimoId = null;     // id del último cogido (para destello del banner)
let sigTablon = "", sigFeed = "";  // firmas para no reescribir (y no romper el autoscroll)

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
  pintarCogido(d.puestos.filter(p => p.adjudicado));
}

// ===================== TABLÓN "POR OFERTAR" =====================
function pintarTablon(puestos) {
  if (!puestos.length) {
    if (sigTablon !== "vacio") { $("pendientes").innerHTML = '<p class="vacio">No hay puestos cargados.</p>'; sigTablon = "vacio"; }
    return;
  }
  const centros = {};
  puestos.forEach(p => {
    const k = claveCentro(p.centro);
    const c = centros[k] || (centros[k] = { nombre: (p.centro || "(Sin centro)").trim(), ambitos: new Set(), tipos: {}, quedan: 0, total: 0 });
    if ((p.ambito || "").trim()) c.ambitos.add(p.ambito.trim());
    const tk = `${p.duracion}|${p.fecha_inicio}|${p.fecha_fin}|${p.turno}|${p.ambito}`;
    const t = c.tipos[tk] || (c.tipos[tk] = { p, libres: 0, dadas: 0 });
    c.total++;
    if (p.adjudicado) { t.dadas++; } else { t.libres++; c.quedan++; }
  });

  const orden = Object.values(centros).sort((a, b) =>
    (a.quedan === 0) - (b.quedan === 0) || a.nombre.localeCompare(b.nombre));

  // Firma: solo redibuja si cambian conteos (así el autoscroll no se reinicia en cada refresco).
  const sig = orden.map(c => c.nombre + ":" + Object.values(c.tipos).map(t => t.libres + "/" + t.dadas).join(",")).join("|");
  if (sig === sigTablon) return;
  sigTablon = sig;

  const aviso = orden.every(c => c.quedan === 0) ? '<p class="vacio">No quedan puestos por ofertar. 🎉</p>' : "";
  $("pendientes").innerHTML = aviso + orden.map(tarjetaCentro).join("");
}

function tarjetaCentro(c) {
  const ambitos = [...(c.ambitos || [])];
  const unico = ambitos.length === 1 ? ambitos[0] : "";   // un solo ámbito → subtítulo
  const tipos = Object.values(c.tipos).map(t => {
    const p = t.p, total = t.libres + t.dadas;
    const ambTipo = (!unico && (p.ambito || "").trim()) ? p.ambito.trim() : "";
    const det = [ambTipo, rangoMeses(p), turnoTxt(p), (p.necesidad || "").trim()].filter(s => s && s.trim()).map(esc).join(" · ");
    return `<div class="tipo">
        <div class="lin1">
          <span class="durh">${esc(mesesHumano(p))}</span>
          <span class="cuenta">Quedan <b>${t.libres}</b> de ${total}</span>
        </div>
        ${det ? `<div class="det">${det}</div>` : ""}
        <div class="barra-tipo"><span class="seg libre" style="flex:${t.libres}"></span><span class="seg dada" style="flex:${t.dadas}"></span></div>
      </div>`;
  }).join("");
  const urgenteCentro = (c.quedan > 0 && c.quedan <= 2) ? "urge" : "";
  const badge = c.quedan > 0
    ? `<span class="quedan-grande ${urgenteCentro}">Quedan <b>${c.quedan}</b></span>`
    : `<span class="quedan-grande cero">Completo</span>`;
  const sub = unico ? `<div class="amb">${esc(unico)}</div>` : "";
  return `<div class="centro ${c.quedan === 0 ? "agotado" : ""}">
      <div class="cabc"><div><span class="nomc">${esc(c.nombre)}</span>${sub}</div>${badge}</div>
      ${tipos}
    </div>`;
}

// ===================== "LO COGIDO" =====================
// Rejilla de campos etiquetados (Centro / Duración / Fechas / Turno); omite los vacíos.
function camposContrato(p) {
  const filas = [
    ["Centro", `<span class="valor centro">${esc(p.centro || "—")}</span>`],
    (p.ambito || "").trim() && ["Ámbito", `<span class="valor">${esc(p.ambito)}</span>`],
    mesesHumano(p) && ["Duración", `<span class="valor">${esc(mesesHumano(p))}</span>`],
    fechasFull(p) && ["Fechas", `<span class="valor">${esc(fechasFull(p))}</span>`],
    turnoTxt(p) && ["Turno", `<span class="valor">${esc(turnoTxt(p))}</span>`],
    (p.necesidad || "").trim() && ["Necesidad", `<span class="valor">${esc(p.necesidad)}</span>`],
  ].filter(Boolean);
  return `<div class="campos">${filas.map(([r, v]) => `<span class="rotulo">${r}</span>${v}`).join("")}</div>`;
}

function pintarCogido(lista) {
  $("cuantos").textContent = lista.length ? `(${lista.length})` : "";

  if (!lista.length) {
    if (sigFeed !== "vacio") {
      $("ultimo").innerHTML = "";
      $("porcentro").innerHTML = "";
      $("adjudicados").innerHTML = '<p class="vacio">Aún no se ha cogido ningún contrato.</p>';
      sigFeed = "vacio"; vistos = new Set(); ultimoId = null;
    }
    return;
  }

  // Orden cronológico ascendente para numerar #1..#N de forma estable.
  const asc = lista.slice().sort((a, b) =>
    String(a.hora).localeCompare(String(b.hora)) || (a.id - b.id));
  asc.forEach((p, i) => { p._seq = i + 1; });
  const ultimo = asc[asc.length - 1];

  // ----- Banner del último (siempre visible, fuera del scroll) -----
  if (ultimo.id !== ultimoId) {
    const heroLinea = [ultimo.centro, mesesHumano(ultimo), turnoTxt(ultimo)].filter(Boolean).map(esc).join(" · ");
    $("ultimo").innerHTML = `
      <div class="hero destacar">
        <div class="hero-tag">Último contrato cogido · ${esc(hhmm(ultimo.hora))}</div>
        <div class="hero-cuerpo">
          <span class="hero-nc">Nº${esc(ultimo.num_candidato)}</span>
          <span class="hero-nom">${esc(ultimo.nombre_pila || ultimo.asignado_a)}</span>
        </div>
        <div class="hero-contr">${heroLinea}</div>
        ${fechasFull(ultimo) ? `<div class="hero-fechas">${esc(fechasFull(ultimo))}</div>` : ""}
      </div>`;
    ultimoId = ultimo.id;
  }

  // ----- Contadores por centro -----
  const porC = {};
  asc.forEach(p => { const k = claveCentro(p.centro); (porC[k] = porC[k] || { nombre: (p.centro || "—").trim(), n: 0 }).n++; });
  $("porcentro").innerHTML = Object.values(porC).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
    .map(c => `<span class="chip">${esc(c.nombre)} <b>${c.n}</b></span>`).join("");

  // ----- Feed numerado, lo más reciente arriba -----
  const sig = asc.map(p => p.id + ":" + p.hora).join("|");
  const primera = vistos === null;
  if (primera) vistos = new Set();

  if (sig !== sigFeed) {
    const desc = asc.slice().reverse();
    $("adjudicados").innerHTML = desc.map(p => {
      const nuevo = !primera && !vistos.has(p.id);
      return `<div class="item ${nuevo ? "nuevo" : ""}">
          <div class="item-top">
            <span class="seq">#${p._seq}</span>
            <span class="nc">Nº${esc(p.num_candidato)}</span>
            <span class="nom">${esc(p.nombre_pila || p.asignado_a)}</span>
            <span class="hora">${esc(hhmm(p.hora))}</span>
          </div>
          ${camposContrato(p)}
        </div>`;
    }).join("");
    sigFeed = sig;
    vistos = new Set(asc.map(p => p.id));
  }
}

// ===================== AUTO-DESPLAZAMIENTO =====================
// Desplaza despacio el contenedor cuando su contenido desborda; pausa arriba/abajo y vuelve.
function autoScroll(el) {
  const PASO = 1, INTERVALO = 45, PAUSA = 2500;
  let dir = 1, pausaHasta = 0;
  setInterval(() => {
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 4) { el.scrollTop = 0; return; }   // no desborda
    if (Date.now() < pausaHasta) return;
    el.scrollTop += dir * PASO;
    if (dir > 0 && el.scrollTop >= max - 1) { dir = -1; pausaHasta = Date.now() + PAUSA; }
    else if (dir < 0 && el.scrollTop <= 1) { dir = 1; pausaHasta = Date.now() + PAUSA; }
  }, INTERVALO);
}

refrescar();
setInterval(refrescar, 3000);
document.querySelectorAll(".scroll").forEach(autoScroll);
