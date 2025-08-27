// ===== Supabase config =====
const SUPABASE_URL = "https://sefqzqeztnazpbsolbos.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZnF6cWV6dG5henBic29sYm9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwNDM2MjEsImV4cCI6MjA3MDYxOTYyMX0.9aSakQ3GL3I_H1voXTCN2WdaCMBRDMu5kmLJm3bVa6o";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== UI refs =====
const $ = (id) => document.getElementById(id);
const loginBox = $("loginBox");
const appBox = $("appBox");
const emailInput = $("email");
const sendLinkBtn = $("sendLinkBtn");
const loginMsg = $("loginMsg");

const titleInput = $("title");
const openAtInput = $("openAt");
const startDateInput = $("startDate");
const endDateInput = $("endDate");
const amDaysBox = $("amDays");
const pmDaysBox = $("pmDays");
const openNowBtn = $("openNowBtn");
const scheduleBtn = $("scheduleBtn");
const closeBtn = $("closeBtn");
const saveWindowBtn = $("saveWindowBtn");
const newVisitBtn = $("newVisitBtn");
const appMsg = $("appMsg");
const stateBadge = $("stateBadge");
const stateDesc = $("stateDesc");
const visitsTbody = $("visitsTbody");
const logoutBtn = $("logoutBtn");

let currentVisitId = null;

// ===== Helpers =====
const DAYS = ["D","L","M","X","J","V","S"]; // 0..6

function buildDays(container, name) {
  container.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const label = document.createElement("label");
    label.className = "flex items-center gap-1";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(i);
    cb.dataset.group = name;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(DAYS[i]));
    container.appendChild(label);
  }
}
buildDays(amDaysBox, "am");
buildDays(pmDaysBox, "pm");

function getCheckedSet(group) {
  return new Set([...document.querySelectorAll(`input[type="checkbox"][data-group="${group}"]:checked`)]
    .map(cb => Number(cb.value)));
}
function setChecked(group, values = []) {
  const set = new Set(values.map(Number));
  document.querySelectorAll(`input[type="checkbox"][data-group="${group}"]`).forEach(cb => {
    cb.checked = set.has(Number(cb.value));
  });
}

function setBadge(state) {
  const map = {
    active:  "bg-green-600",
    scheduled: "bg-amber-600",
    concluded: "bg-zinc-600",
    noscheduled: "bg-zinc-600"
  };
  stateBadge.textContent = state || "—";
  stateBadge.className = `px-2 py-0.5 rounded-lg text-white text-xs ${map[state] || "bg-zinc-600"}`;
}

function msg(el, text, kind="") {
  el.textContent = text || "";
  el.className = "text-sm mt-2 " + (kind === "error" ? "text-red-600" :
                                     kind === "ok" ? "text-green-700" : "text-zinc-600");
}

// ===== Auth flow (magic link) =====
async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    loginBox.classList.add("hidden");
    appBox.classList.remove("hidden");
    await bootstrapData();
  } else {
    loginBox.classList.remove("hidden");
    appBox.classList.add("hidden");
  }
}
sendLinkBtn.addEventListener("click", async () => {
  const email = (emailInput.value || "").trim();
  if (!email) { msg(loginMsg, "Escribe tu correo.", "error"); return; }

  msg(loginMsg, "Enviando enlace…");
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href } // vuelve a /admin.html
  });
  if (error) msg(loginMsg, "No se pudo enviar el enlace.", "error");
  else msg(loginMsg, "Revisa tu correo y abre el enlace para entrar.", "ok");
});

logoutBtn.addEventListener("click", async () => {
  await db.auth.signOut();
  location.reload();
});

// ===== Data bootstrap =====
async function bootstrapData() {
  // 1) Estado público (visit_status)
  try {
    const { data, error } = await db.rpc("visit_status");
    if (error) throw error;
    const s = (data && data[0]) ? data[0] : null;
    if (s) {
      setBadge(s.state);
      stateDesc.textContent =
        s.state === "active" ? "La visita está abierta. El formulario es visible."
      : s.state === "scheduled" ? "Inscripciones programadas; aún no abren."
      : s.state === "concluded" ? "La visita concluyó."
      : "Aún no hay visita programada.";
    }
  } catch (_) {
    setBadge("noscheduled");
    stateDesc.textContent = "No se pudo leer el estado.";
  }

  // 2) Cargar o crear fila de visitas (la más reciente)
  const { data: visits } = await db
    .from("visitas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  visitsTbody.innerHTML = "";
  if (visits && visits.length) {
    visits.forEach(v => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="border p-2">${v.id}</td>
        <td class="border p-2">${v.title || ""}</td>
        <td class="border p-2">${v.start_date || ""}</td>
        <td class="border p-2">${v.end_date || ""}</td>
        <td class="border p-2">${v.is_open ? "true" : "false"}</td>
        <td class="border p-2">${v.open_at || ""}</td>
        <td class="border p-2"><button data-id="${v.id}" class="px-2 py-1 border rounded">Editar</button></td>
      `;
      visitsTbody.appendChild(tr);
    });
    loadVisit(visits[0]); // por defecto, la más reciente
  } else {
    // Si no hay, crea una por defecto
    const today = new Date(); const yyyy = today.getFullYear(), mm = String(today.getMonth()+1).padStart(2,'0'), dd = String(today.getDate()).padStart(2,'0');
    const { data: inserted, error } = await db.from("visitas").insert({
      title: "Nueva visita",
      start_date: `${yyyy}-${mm}-${dd}`,
      end_date: `${yyyy}-${mm}-${dd}`,
      am_days: [3,4,5,6,0],
      pm_days: [3,5],
      open_at: new Date().toISOString(),
      is_open: false
    }).select("*").single();
    if (!error) {
      await bootstrapData();
      msg(appMsg, "Se creó una visita nueva por defecto.", "ok");
    } else {
      msg(appMsg, "No se pudo crear una visita por defecto.", "error");
    }
  }

  // Click en “Editar”
  visitsTbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const row = [...visitsTbody.querySelectorAll("tr")]
      .map(tr => ({
        id: Number(tr.children[0].textContent),
        title: tr.children[1].textContent,
        start_date: tr.children[2].textContent,
        end_date: tr.children[3].textContent,
        is_open: tr.children[4].textContent === "true",
        open_at: tr.children[5].textContent
      }))
      .find(r => r.id === id);
    if (row) loadVisit(row);
  });
}

function loadVisit(v) {
  currentVisitId = v.id;
  titleInput.value = v.title || "";
  startDateInput.value = (v.start_date || "").slice(0,10);
  endDateInput.value = (v.end_date || "").slice(0,10);
  // open_at → datetime-local (sin Z)
  if (v.open_at) {
    const dt = new Date(v.open_at);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
    openAtInput.value = local;
  } else {
    openAtInput.value = "";
  }
  // Días (si vienen en visits no los tenemos; volvemos a pedir detalle)
  db.from("visitas").select("am_days, pm_days").eq("id", v.id).single().then(({ data }) => {
    setChecked("am", data?.am_days || []);
    setChecked("pm", data?.pm_days || []);
  });
}

// ===== Actions =====
openNowBtn.addEventListener("click", async () => {
  if (!currentVisitId) return;
  const nowIso = new Date().toISOString();
  const { error } = await db.from("visitas").update({ is_open: true, open_at: nowIso }).eq("id", currentVisitId);
  if (error) msg(appMsg, "No se pudo abrir.", "error");
  else { msg(appMsg, "Visita abierta desde ahora.", "ok"); await bootstrapData(); }
});

scheduleBtn.addEventListener("click", async () => {
  if (!currentVisitId) return;
  const val = openAtInput.value;
  if (!val) { msg(appMsg, "Selecciona fecha/hora en 'Abrir (open_at)'.", "error"); return; }
  const iso = new Date(val).toISOString();
  const { error } = await db.from("visitas").update({ is_open: true, open_at: iso }).eq("id", currentVisitId);
  if (error) msg(appMsg, "No se pudo programar apertura.", "error");
  else { msg(appMsg, "Apertura programada.", "ok"); await bootstrapData(); }
});

closeBtn.addEventListener("click", async () => {
  if (!currentVisitId) return;
  const { error } = await db.from("visitas").update({ is_open: false }).eq("id", currentVisitId);
  if (error) msg(appMsg, "No se pudo cerrar.", "error");
  else { msg(appMsg, "Visita cerrada.", "ok"); await bootstrapData(); }
});

saveWindowBtn.addEventListener("click", async () => {
  if (!currentVisitId) return;
  const start = sta
