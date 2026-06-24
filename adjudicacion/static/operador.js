// Panel del operador (candidato-primero): lista de candidatos; al elegir uno se abre un modal
// con la lista de contratos buscable/filtrable para asignarle el que elija.

let ESTADO = { puestos: [], candidatos: [], estados: [], resumen: {} };
let POR_CAND = {};         // num_candidato -> [puestos asignados]
let CAND_ACTUAL = null;    // candidato cuyo contrato se está eligiendo en el modal
let PUESTO_SELECC = null;  // contrato elegido en el modal

const $ = (id) => document.getElementById(id);

async function api(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}

function aviso(msg) {
  const a = $("aviso");
  if (!msg) { a.classList.remove("visible"); return; }
  a.textContent = msg;
  a.classList.add("visible");
}

// ---------- Carga y pintado ----------

async function cargar() {
  const d = await api("/api/estado");
  if (!d.ok) { aviso(d.error || "Error al cargar"); return; }
  ESTADO = d;
  aviso(d.ultimo_error);
  // Mapa inverso candidato -> puestos asignados.
  POR_CAND = {};
  (ESTADO.puestos || []).forEach(p => {
    const n = String(p.num_candidato || "").trim();
    if (n) (POR_CAND[n] || (POR_CAND[n] = [])).push(p);
  });
  $("c-total").textContent = d.resumen.total;
  $("c-asig").textContent = d.resumen.adjudicados;
  $("c-pend").textContent = d.resumen.pendientes;
  $("hora").textContent = d.actualizado;
  rellenarEstadosSelect();
  pintar();
}

function _claveFecha(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim());
  return m ? `${m[3]}${m[2]}${m[1]}` : "";   // aaaammdd para ordenar
}

function rellenarEstadosSelect() {
  const sel = $("modal-estado");
  if (sel.options.length) return;
  sel.innerHTML = (ESTADO.estados || []).map(e => `<option>${esc(e)}</option>`).join("");
}

function fechas(p) {
  if (!p.fecha_inicio && !p.fecha_fin) return "";
  return `${esc(p.fecha_inicio)} – ${esc(p.fecha_fin)}`;
}

// Texto resumido de un contrato (centro · Nd · fechas · turno).
function contratoTxt(p) {
  const partes = [p.centro];
  if (p.duracion) partes.push(`${p.duracion} d`);
  const f = (p.fecha_inicio || p.fecha_fin) ? `${p.fecha_inicio} – ${p.fecha_fin}` : "";
  if (f) partes.push(f);
  if (p.turno) partes.push(p.turno);
  return partes.filter(Boolean).map(esc).join(" · ");
}

// Puestos asignados a un candidato (normalmente 0 o 1).
function puestosDe(cand) {
  return POR_CAND[String(cand.numero)] || [];
}

function candidatosFiltrados() {
  const txt = $("filtro").value.trim().toLowerCase();
  const est = $("filtro-cestado").value;
  return (ESTADO.candidatos || []).filter(c => {
    const asignado = puestosDe(c).length > 0;
    if (est === "__sin" && asignado) return false;
    if (est === "__asig" && !asignado) return false;
    if (txt) {
      const blob = [c.numero, c.nombre, c.dni, c.telefono].join(" ").toLowerCase();
      if (!blob.includes(txt)) return false;
    }
    return true;
  });
}

function pintar() {
  const total = (ESTADO.candidatos || []).length;
  const asignados = (ESTADO.candidatos || []).filter(c => puestosDe(c).length > 0).length;
  $("cand-cuenta").textContent = `Asignados ${asignados} / ${total}`;

  const cuerpo = $("cuerpo");
  const filas = candidatosFiltrados();
  cuerpo.innerHTML = filas.map(c => {
    const ps = puestosDe(c);
    const asignado = ps.length > 0;
    const contrato = asignado
      ? ps.map(p => `<div><b>${esc(p.centro)}</b> <span class="mini">${fechas(p)}</span>
            <span class="pill" data-e="${esc(p.estado)}">${esc(p.estado)}</span></div>`).join("")
      : '<span class="mini">—</span>';
    const acciones = asignado
      ? ps.map(p => `
          <select onchange="cambiarEstado(${p.id}, this.value)" title="Cambiar estado">
            ${ESTADO.estados.map(e => `<option ${e === p.estado ? 'selected' : ''}>${esc(e)}</option>`).join("")}
          </select>
          <button class="peligro" onclick="liberar(${p.id})" title="Liberar contrato">✕</button>`).join("")
        + `<button class="sec" onclick="abrirAsignar(${c.numero})">Otro contrato</button>`
      : `<button onclick="abrirAsignar(${c.numero})">Asignar contrato</button>`;
    return `<tr class="${asignado ? 'asignado' : ''}">
      <td><b>${esc(c.numero)}</b></td>
      <td>${esc(c.nombre)}</td>
      <td class="mini">${esc(c.dni)}</td>
      <td class="mini">${esc(c.puntos)}</td>
      <td>${contrato}</td>
      <td>${acciones}</td>
    </tr>`;
  }).join("");
  if (!filas.length) cuerpo.innerHTML = '<tr><td colspan="6" class="mini" style="padding:20px">Sin candidatos que coincidan con el filtro.</td></tr>';
}

// ---------- Acciones ----------

async function cambiarEstado(id, estado) {
  const d = await api("/api/estado_puesto", postJSON({ puesto_id: id, estado }));
  if (!d.ok) aviso(d.error);
  cargar();
}

async function liberar(id) {
  if (!confirm("¿Liberar este contrato y dejarlo de nuevo por ofertar?")) return;
  const d = await api("/api/liberar", postJSON({ puesto_id: id }));
  if (!d.ok) aviso(d.error);
  cargar();
}

// ---------- Modal: elegir contrato para el candidato ----------

function abrirAsignar(numero) {
  CAND_ACTUAL = (ESTADO.candidatos || []).find(c => String(c.numero) === String(numero));
  PUESTO_SELECC = null;
  if (!CAND_ACTUAL) return;
  $("modal-titulo").textContent = `Asignar contrato a Nº${CAND_ACTUAL.numero} · ${CAND_ACTUAL.nombre}`;
  rellenarFiltrosModal();
  $("m-busca").value = "";
  $("m-disp").value = "__libres";
  $("modal-estado").value = "Aceptado";
  $("modal-aceptar").disabled = true;
  pintarContratos();
  $("modal-fondo").classList.add("visible");
  setTimeout(() => $("m-busca").focus(), 50);
}

function cerrarModal() { $("modal-fondo").classList.remove("visible"); }

function rellenarFiltrosModal() {
  const centros = [...new Set(ESTADO.puestos.map(p => p.centro).filter(Boolean))].sort();
  setOpciones("m-centro", '<option value="">Todos los centros</option>' + centros.map(c => `<option>${esc(c)}</option>`).join(""));
  const dias = [...new Set(ESTADO.puestos.map(p => String(p.duracion || "").trim()).filter(Boolean))]
    .sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  setOpciones("m-dias", '<option value="">Todos los días</option>' + dias.map(d => `<option value="${esc(d)}">${esc(d)} días</option>`).join(""));
  const finis = [...new Set(ESTADO.puestos.map(p => (p.fecha_inicio || "").trim()).filter(Boolean))]
    .sort((a, b) => _claveFecha(a).localeCompare(_claveFecha(b)));
  setOpciones("m-fini", '<option value="">Cualquier inicio</option>' + finis.map(v => `<option>${esc(v)}</option>`).join(""));
}

function setOpciones(id, html) {
  const sel = $(id);
  const actual = sel.value;
  sel.innerHTML = html;
  sel.value = actual;
}

function contratosFiltrados() {
  const txt = $("m-busca").value.trim().toLowerCase();
  const centro = $("m-centro").value;
  const dias = $("m-dias").value;
  const fini = $("m-fini").value;
  const disp = $("m-disp").value;
  return ESTADO.puestos.filter(p => {
    if (disp === "__libres" && p.adjudicado) return false;
    if (centro && p.centro !== centro) return false;
    if (dias && String(p.duracion || "").trim() !== dias) return false;
    if (fini && (p.fecha_inicio || "").trim() !== fini) return false;
    if (txt) {
      const blob = [p.centro, p.ambito, p.fecha_inicio, p.fecha_fin, p.duracion, p.turno, p.necesidad, p.asignado_a]
        .join(" ").toLowerCase();
      if (!blob.includes(txt)) return false;
    }
    return true;
  }).sort((a, b) => (a.adjudicado === b.adjudicado) ? a.id - b.id : (a.adjudicado ? 1 : -1)); // libres primero
}

function pintarContratos() {
  const lista = contratosFiltrados();
  const cont = $("m-lista");
  if (!lista.length) {
    cont.innerHTML = '<div class="mini" style="padding:14px">Ningún contrato coincide con el filtro.</div>';
    return;
  }
  const TOPE = 300;
  cont.innerHTML = lista.slice(0, TOPE).map(p => {
    const ocupado = p.adjudicado || p.asignado_a;
    const marca = String(p.id) === String(PUESTO_SELECC && PUESTO_SELECC.id) ? " sel" : "";
    const estado = ocupado
      ? `<span class="pill" data-e="${esc(p.estado)}">ocupado: ${esc(p.asignado_a || p.estado)}</span>`
      : '<span class="libre-tag">libre</span>';
    return `<div class="contrato${ocupado ? ' ocupado' : ''}${marca}" onclick="elegirContrato(${p.id})">
        <span class="c-num">#${esc(p.id - 1)}</span>
        <span class="c-txt">${contratoTxt(p)}${p.necesidad ? ` <span class="mini">· ${esc(p.necesidad)}</span>` : ""}</span>
        ${estado}
      </div>`;
  }).join("") + (lista.length > TOPE ? `<div class="mini" style="padding:8px">…y ${lista.length - TOPE} más. Afina el filtro.</div>` : "");
}

function elegirContrato(id) {
  PUESTO_SELECC = ESTADO.puestos.find(p => p.id === id) || null;
  $("modal-aceptar").disabled = !PUESTO_SELECC;
  pintarContratos();
}

async function aceptarAsignacion() {
  if (!CAND_ACTUAL || !PUESTO_SELECC) return;
  if (PUESTO_SELECC.adjudicado || PUESTO_SELECC.asignado_a) {
    if (!confirm(`Ese contrato ya está asignado a ${PUESTO_SELECC.asignado_a || "otra persona"}. ¿Reasignarlo a ${CAND_ACTUAL.nombre}?`)) return;
  }
  const d = await api("/api/asignar", postJSON({
    puesto_id: PUESTO_SELECC.id,
    numero_candidato: CAND_ACTUAL.numero,
    estado: $("modal-estado").value,
  }));
  cerrarModal();
  if (!d.ok && d.error) aviso(d.error);
  cargar();
}

// ---------- Utilidades ----------

function postJSON(obj) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

$("modal-cancelar").onclick = cerrarModal;
$("modal-aceptar").onclick = aceptarAsignacion;
$("modal-fondo").addEventListener("click", (e) => { if (e.target === $("modal-fondo")) cerrarModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });
["filtro", "filtro-cestado"].forEach(id => $(id).addEventListener("input", pintar));
["m-busca", "m-centro", "m-dias", "m-fini", "m-disp"].forEach(id => $(id).addEventListener("input", pintarContratos));

cargar();
setInterval(cargar, 5000); // refresco suave por si acaso
