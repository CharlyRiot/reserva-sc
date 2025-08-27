// ==========================
//  Configuración Supabase
// ==========================
const SUPABASE_URL = "https://sefqzqeztnazpbsolbos.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZnF6cWV6dG5henBic29sYm9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwNDM2MjEsImV4cCI6MjA3MDYxOTYyMX0.9aSakQ3GL3I_H1voXTCN2WdaCMBRDMu5kmLJm3bVa6o";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================
//  Helpers y referencias UI
// ==========================
const $ = (id) => document.getElementById(id);

const form = $("reservaForm"),
      formMsg = $("formMsg"),
      submitBtn = $("submitBtn"),
      nameInput = $("name"),
      dateInput = $("date"),
      personSelect = $("person"),
      slotSelect = $("slot"),
      optAM = $("optAM"),
      optPM = $("optPM"),
      optSC = $("optSC"),
      optEsposa = $("optEsposa"),
      successBox = $("successBox"),
      errorBox = $("errorBox"),
      thanksName = $("thanksName"),
      thanksDate = $("thanksDate"),
      thanksPerson = $("thanksPerson"),
      thanksTime = $("thanksTime"),
      retryBtn = $("retryBtn"),
      newBtn = $("newBtn"),
      statusBox = $("statusBox"),
      statusText = $("statusText"),
      statusTitle = $("statusTitle");

// Días permitidos dinámicos (se llenan desde Supabase::visit_status)
let AM_ALLOWED = new Set();
let PM_ALLOWED = new Set();

// ==========================
//  Mensajería corta
// ==========================
function setFormMsg(text, kind = "") {
  formMsg.textContent = text || "";
  formMsg.className =
    "text-sm mt-1 " +
    (kind === "error" ? "text-red-600" :
     kind === "warn"  ? "text-amber-600" : "text-zinc-600");
}

// ==========================
//  PWA: Service Worker
//  (nota: con js/sw.js el scope es /js/*)
// ==========================
if ("serviceWorker" in navigator) {
  // Si mueves sw.js a la raíz, usa navigator.serviceWorker.register('/sw.js')
  navigator.serviceWorker.register("js/sw.js").catch(() => {});
}

let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Aquí podrías mostrar un botón "Instalar" y llamar deferredPrompt.prompt();
});

// ==========================
//  Estado de visita (abre/cierra formulario)
// ==========================
async function loadStatusAndConfigure() {
  // Intenta leer estado desde RPC visit_status (si no existe, cae a formulario tradicional)
  try {
    const { data, error } = await db.rpc("visit_status");
    if (error) throw error;

    const s = (data && data[0]) ? data[0] : null;

    if (!s || s.state !== "active") {
      // Cualquier estado que NO sea activo ⇒ mostrar mensaje y ocultar form
      form.classList.add("hidden");
      statusBox.classList.remove("hidden");

      if (!s) {
        statusTitle.textContent = "Sin fecha programada";
        statusText.textContent = "Aún no hay fecha de la próxima visita. ¡Gracias por estar atento!";
        return;
      }

      if (s.state === "scheduled") {
        statusTitle.textContent = "Inscripciones aún no abiertas";
        statusText.textContent = s.message || "Vuelve pronto.";
      } else if (s.state === "concluded") {
        statusTitle.textContent = "La visita concluyó";
        statusText.textContent = s.message || "Aún no hay fecha de la próxima visita.";
      } else { // noscheduled
        statusTitle.textContent = "Sin fecha programada";
        statusText.textContent = s.message || "Aún no hay fecha de la próxima visita.";
      }
      return;
    }

    // ACTIVO → mostrar formulario con límites
    statusBox.classList.add("hidden");
    form.classList.remove("hidden");

    // Limita el datepicker a la ventana oficial
    if (s.start_date) dateInput.min = s.start_date;
    if (s.end_date)   dateInput.max = s.end_date;

    // Días permitidos para AM/PM
    AM_ALLOWED = new Set((s.am_days || []).map(Number));
    PM_ALLOWED = new Set((s.pm_days || []).map(Number));

  } catch (err) {
    // Si falla el status, por seguridad mostramos solo mensaje
    form.classList.add("hidden");
    statusBox.classList.remove("hidden");
    statusTitle.textContent = "Estado no disponible";
    statusText.textContent = "No se pudo cargar el estado. Intenta más tarde.";
  }
}

// ==========================
//  Lógica de slots y disponibilidad
// ==========================
function updateAllowedSlots() {
  const d = dateInput.value;
  if (!d) return;

  const dow = new Date(d + "T00:00").getDay(); // 0=Dom ... 6=Sáb
  const amOk = AM_ALLOWED.has(dow);
  const pmOk = PM_ALLOWED.has(dow);

  optAM.disabled = !amOk;
  optPM.disabled = !pmOk;
  optAM.textContent = amOk ? "Mañana (9:00 a.m.)" : "Mañana — No disponible";
  optPM.textContent = pmOk ? "Tarde (4:30 p.m.)" : "Tarde — No disponible";

  if ((slotSelect.value === "AM" && !amOk) || (slotSelect.value === "PM" && !pmOk)) {
    slotSelect.value = "";
  }
}

function updateSubmitState() {
  const hasDate = !!dateInput.value;
  const hasSlot = !!slotSelect.value;
  const personVal = personSelect.value;
  const personOption = personVal ? document.querySelector(`#person option[value="${personVal}"]`) : null;
  const personValid = !!personVal && personOption && !personOption.disabled;

  const bothDisabled = optSC.disabled && optEsposa.disabled;
  if (bothDisabled) {
    personSelect.value = "";
    setFormMsg("No hay cupos para esa fecha y turno.", "warn");
  } else if (personVal && personOption && personOption.disabled) {
    personSelect.value = "";
    setFormMsg("Esa persona se ocupó para ese día/turno. Elige otra.", "warn");
  } else {
    if (formMsg.textContent.includes("cupo") || formMsg.textContent.includes("ocupó")) {
      setFormMsg("");
    }
  }

  submitBtn.disabled = !(hasDate && hasSlot && personValid && !bothDisabled);
}

// Fecha mínima por defecto = hoy (si no hay ventana desde visit_status)
(function setMinTodayIfEmpty() {
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  if (!dateInput.min) dateInput.min = `${yyyy}-${mm}-${dd}`;
})();

async function checkAvailability() {
  const d = dateInput.value;
  if (!d) return;

  updateAllowedSlots();

  [optSC, optEsposa].forEach(o => {
    o.disabled = false;
    o.textContent = o.value === "SC" ? "Superintendente de Circuito" : "Esposa del SC";
  });

  if (!slotSelect.value) { updateSubmitState(); return; }

  const { data, error } = await db.rpc("taken_persons_by_slot", {
    p_date: d,
    p_slot: slotSelect.value
  });

  if (error) {
    setFormMsg("No se pudo verificar disponibilidad.", "error");
    updateSubmitState();
    return;
  }

  const taken = new Set((data || []).map(r => r.person));
  if (taken.has("SC")) {
    optSC.disabled = true;
    optSC.textContent = "Superintendente de Circuito — Ocupado";
  }
  if (taken.has("Esposa")) {
    optEsposa.disabled = true;
    optEsposa.textContent = "Esposa del SC — Ocupado";
  }

  updateSubmitState();
}

// ==========================
//  Listeners
// ==========================
dateInput?.addEventListener("change", () => { updateAllowedSlots(); checkAvailability(); });
slotSelect?.addEventListener("change", () => { checkAvailability(); });
personSelect?.addEventListener("change", updateSubmitState);

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setFormMsg("");
  submitBtn.disabled = true; submitBtn.textContent = "Reservando...";

  if (!dateInput.value || !slotSelect.value || !personSelect.value) {
    setFormMsg("Completa fecha, turno y persona.", "error");
    submitBtn.disabled = false; submitBtn.textContent = "Reservar cupo";
    return;
  }

  const payload = {
    name: (nameInput.value || "").trim(),
    person: personSelect.value,
    date: dateInput.value,
    slot: slotSelect.value || "AM"
  };

  const { error } = await db.from("reservas").insert(payload);

  if (error) {
    if (error.code === "23505") {
      form.classList.add("hidden");
      errorBox.classList.remove("hidden");
      personSelect.value = "";
      await checkAvailability();
    } else {
      setFormMsg("Error al guardar. Intenta de nuevo.", "error");
      console.error(error);
    }
  } else {
    const nombreCorto = payload.name.split(" ")[0] || payload.name;
    thanksName.textContent = nombreCorto;
    const [y, m, d] = payload.date.split("-");
    thanksDate.textContent = `${d}/${m}/${y}`;
    thanksPerson.textContent = payload.person === "SC" ? "el Superintendente de Circuito" : "la Esposa del SC";
    thanksTime.textContent = payload.slot === "PM" ? "4:30 p.m." : "9:00 a.m.";

    form.classList.add("hidden");
    successBox.classList.remove("hidden");

    const doneAnim = document.getElementById("doneAnim");
    if (doneAnim && doneAnim.play) { try { doneAnim.stop(); doneAnim.play(); } catch (_) {} }
  }

  submitBtn.disabled = false; submitBtn.textContent = "Reservar cupo";
});

retryBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  errorBox.classList.add("hidden");
  form.classList.remove("hidden");
  personSelect.value = "";
  checkAvailability();
});

newBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  successBox.classList.add("hidden");
  form.classList.remove("hidden");
  form.reset();
  setFormMsg("");
  checkAvailability();
  const doneAnim = document.getElementById("doneAnim");
  if (doneAnim && doneAnim.stop) doneAnim.stop();
});

// ==========================
//  Arranque
// ==========================
(async function init() {
  // Carga estado de visita y configura límites
  await loadStatusAndConfigure();
  // Si está activo, prepara disponibilidad inicial
  if (!form.classList.contains("hidden")) {
    // Si el usuario ya trae un valor por autocompletado, refrescar
    if (dateInput.value) updateAllowedSlots();
    checkAvailability();
  }
})();
