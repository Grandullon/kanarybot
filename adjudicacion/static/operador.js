// Panel del operador: lista de puestos, asignación de candidatos y cambios de estado.

let ESTADO = { puestos: [], estados: [], resumen: {} };
let CAND_SELECC = null;   // candidato elegido en el modal
let PUESTO_ACTUAL = null; // puesto que se está asignando

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
  $("c-total").textContent = d.resumen.total;
  $("c-asig").textContent = d.resumen.adjudicados;
  $("c-pend").textContent = d.resumen.pendientes;
  $("hora").textContent = d.actualizado;
  rellenarCentros();
  rellenarDias();
  rellenarEstadoFiltro();
  rellenarEstadosSelect();
  pintar();
}

function rellenarCentros() {
  const sel = $("filtro-centro");
  const actual = sel.value;
  const centros = [...new Set(ESTADO.puestos.map(p => p.centro).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todos los centros</option>' +
    centros.map(c => `<option>${esc(c)}</option>`).join("");
  sel.value = actual;
}

function rellenarDias() {
  const sel = $("filtro-dias");
  const actual = sel.value;
  const dias = [...new Set(ESTADO.puestos.map(p => String(p.duracion || "").trim()).filter(Boolean))]
    .sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  sel.innerHTML = '<option value="">Todos los días</option>' +
    dias.map(d => `<option value="${esc(d)}">${esc(d)} días</option>`).join("");
  sel.value = actual;
}

function rellenarEstadoFiltro() {
  const sel = $("filtro-estado");
  const actual = sel.value;
  const fijas = '<option value="">Todos los estados</option>'
    + '<option value="__pend">Solo por ofertar</option>'
    + '<option value="__adj">Solo adjudicados</option>';
  const estados = (ESTADO.estados || []).map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
  sel.innerHTML = fijas + estados;
  sel.value = actual;
}

function rellenarEstadosSelect() {
  const sel = $("modal-estado");
  if (sel.options.length) return;
  sel.innerHTML = ESTADO.estados.map(e => `<option>${esc(e)}</option>`).join("");
}

function filtrados() {
  const txt = $("filtro").value.trim().toLowerCase();
  const centro = $("filtro-centro").value;
  const dias = $("filtro-dias").value;
  const est = $("filtro-estado").value;
  const persona = $("filtro-persona").value.trim().toLowerCase();
  return ESTADO.puestos.filter(p => {
    if (centro && p.centro !== centro) return false;
    if (dias && String(p.duracion || "").trim() !== dias) return false;
    if (est === "__pend") { if (p.adjudicado) return false; }
    else if (est === "__adj") { if (!p.adjudicado) return false; }
    else if (est && p.estado !== est) return false;
    if (persona) {
      const blobP = [p.asignado_a, p.num_candidato, p.dni_asignado].join(" ").toLowerCase();
      if (!blobP.includes(persona)) return false;
    }
    if (txt) {
      const blob = [p.centro, p.fecha_inicio, p.fecha_fin, p.duracion, p.turno, p.asignado_a, p.dni_asignado, p.num_candidato, p.estado]
        .join(" ").toLowerCase();
      if (!blob.includes(txt)) return false;
    }
    return true;
  });
}

function fechas(p) {
  if (!p.fecha_inicio && !p.fecha_fin) return "";
  return `${esc(p.fecha_inicio)} – ${esc(p.fecha_fin)}`;
}

function pintar() {
  const cuerpo = $("cuerpo");
  const filas = filtrados();
  cuerpo.innerHTML = filas.map(p => {
    const asignado = !!p.asignado_a;
    const persona = asignado
      ? `<b>${esc(p.asignado_a)}</b>` + (p.num_candidato ? ` <span class="mini">(nº ${esc(p.num_candidato)})</span>` : "")
        + (p.dni_asignado ? `<br><span class="mini">${esc(p.dni_asignado)}</span>` : "")
      : '<span class="mini">—</span>';
    return `<tr class="${p.adjudicado ? 'asignado' : ''}">
      <td>${p.id - 1}</td>
      <td>${esc(p.centro)}</td>
      <td class="mini">${fechas(p)}</td>
      <td>${esc(p.duracion)}</td>
      <td>${esc(p.turno)}</td>
      <td>${persona}</td>
      <td><span class="pill" data-e="${esc(p.estado)}">${esc(p.estado)}</span></td>
      <td>
        <button class="sec" onclick="abrirAsignar(${p.id})">${asignado ? 'Reasignar' : 'Asignar'}</button>
        ${asignado ? `
          <select onchange="cambiarEstado(${p.id}, this.value)" title="Cambiar estado">
            ${ESTADO.estados.map(e => `<option ${e === p.estado ? 'selected' : ''}>${esc(e)}</option>`).join("")}
          </select>
          <button class="peligro" onclick="liberar(${p.id})" title="Liberar puesto">✕</button>` : ''}
      </td>
    </tr>`;
  }).join("");
  if (!filas.length) cuerpo.innerHTML = '<tr><td colspan="8" class="mini" style="padding:20px">Sin puestos que coincidan con el filtro.</td></tr>';
}

// ---------- Acciones ----------

async function cambiarEstado(id, estado) {
  const d = await api("/api/estado_puesto", postJSON({ puesto_id: id, estado }));
  if (!d.ok) aviso(d.error);
  cargar();
}

async function liberar(id) {
  if (!confirm("¿Liberar este puesto y dejarlo de nuevo por ofertar?")) return;
  const d = await api("/api/liberar", postJSON({ puesto_id: id }));
  if (!d.ok) aviso(d.error);
  cargar();
}

// ---------- Modal de asignación ----------

function abrirAsignar(id) {
  PUESTO_ACTUAL = ESTADO.puestos.find(p => p.id === id);
  CAND_SELECC = null;
  const f = (PUESTO_ACTUAL.fecha_inicio ? ` · ${PUESTO_ACTUAL.fecha_inicio}–${PUESTO_ACTUAL.fecha_fin}` : "");
  $("modal-titulo").textContent = `Asignar: ${PUESTO_ACTUAL.centro} · ${PUESTO_ACTUAL.duracion}d ${PUESTO_ACTUAL.turno}${f}`.trim();
  $("busca-cand").value = "";
  $("sugerencias").style.display = "none";
  $("modal-estado").value = "Aceptado";
  $("modal-aceptar").disabled = true;
  $("modal-fondo").classList.add("visible");
  setTimeout(() => $("busca-cand").focus(), 50);
}

function cerrarModal() { $("modal-fondo").classList.remove("visible"); }

let temporizadorBusqueda = null;
let indiceActivo = -1;
let sugerenciasActuales = [];

$("busca-cand").addEventListener("input", () => {
  CAND_SELECC = null;
  $("modal-aceptar").disabled = true;
  clearTimeout(temporizadorBusqueda);
  const q = $("busca-cand").value.trim();
  if (!q) { $("sugerencias").style.display = "none"; return; }
  temporizadorBusqueda = setTimeout(async () => {
    const d = await api("/api/candidatos?q=" + encodeURIComponent(q));
    sugerenciasActuales = d.candidatos || [];
    indiceActivo = -1;
    pintarSugerencias();
  }, 120);
});

$("busca-cand").addEventListener("keydown", (e) => {
  const cont = $("sugerencias");
  if (cont.style.display === "none") return;
  if (e.key === "ArrowDown") { indiceActivo = Math.min(indiceActivo + 1, sugerenciasActuales.length - 1); pintarSugerencias(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { indiceActivo = Math.max(indiceActivo - 1, 0); pintarSugerencias(); e.preventDefault(); }
  else if (e.key === "Enter") { if (indiceActivo >= 0) { elegirCandidato(sugerenciasActuales[indiceActivo]); e.preventDefault(); } }
});

function pintarSugerencias() {
  const cont = $("sugerencias");
  if (!sugerenciasActuales.length) {
    cont.innerHTML = '<div class="sugerencia mini">Sin coincidencias</div>';
    cont.style.display = "block";
    return;
  }
  cont.innerHTML = sugerenciasActuales.map((c, i) => `
    <div class="sugerencia ${i === indiceActivo ? 'activa' : ''}" onclick='elegirCandidato(${JSON.stringify(c)})'>
      <span class="n">${c.numero}</span>${esc(c.nombre)}
      <span class="pts">${c.puntos ? c.puntos + ' pts' : ''} ${esc(c.dni)}</span>
    </div>`).join("");
  cont.style.display = "block";
}

function elegirCandidato(c) {
  CAND_SELECC = c;
  $("busca-cand").value = `${c.numero} · ${c.nombre}`;
  $("sugerencias").style.display = "none";
  $("modal-aceptar").disabled = false;
}

async function aceptarAsignacion() {
  if (!CAND_SELECC || !PUESTO_ACTUAL) return;
  const d = await api("/api/asignar", postJSON({
    puesto_id: PUESTO_ACTUAL.id,
    numero_candidato: CAND_SELECC.numero,
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
["filtro", "filtro-centro", "filtro-dias", "filtro-estado", "filtro-persona"].forEach(id => $(id).addEventListener("input", pintar));

cargar();
setInterval(cargar, 5000); // refresco suave por si acaso
