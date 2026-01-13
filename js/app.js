// ==========================
//  Firebase SDK Imports
// ==========================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, addDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ==========================
//  Firebase Config
// ==========================
// Pega aquí tu objeto firebaseConfig de la consola de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCkQisqMEqmKrAbhBPl0xroQQFZFYT0TkY",
    authDomain: "reserva-sc.firebaseapp.com",
    projectId: "reserva-sc",
    storageBucket: "reserva-sc.firebasestorage.app",
    messagingSenderId: "651352627398",
    appId: "1:651352627398:web:8120205020de4f6a89dfc7",
    measurementId: "G-3KZTLF3SBB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================
//  Helpers y referencias UI (AHORA SÍ, CORREGIDO AL 100%)
// ==========================
const $ = (id) => document.getElementById(id);

const form = $("reservaForm");
const formMsg = $("formMsg");          // CORREGIDO
const submitBtn = $("submitBtn");      // CORREGIDO
const nameInput = $("name");           // CORREGIDO
const dateInput = $("date");           // CORREGIDO
const personSelect = $("person");      // CORREGIDO
const slotSelect = $("slot");          // CORREGIDO
const optAM = $("optAM");              // CORREGIDO
const optPM = $("optPM");              // CORREGIDO
const optSC = $("optSC");              // CORREGIDO
const optEsposa = $("optEsposa");      // CORREGIDO
const successBox = $("successBox");    // CORREGIDO
const errorBox = $("errorBox");        // CORREGIDO
const thanksName = $("thanksName");    // CORREGIDO
const thanksDate = $("thanksDate");    // CORREGIDO
const thanksPerson = $("thanksPerson"); // CORREGIDO
const thanksTime = $("thanksTime");    // CORREGIDO
const retryBtn = $("retryBtn");        // CORREGIDO
const newBtn = $("newBtn");            // CORREGIDO
const statusBox = $("statusBox");      // CORREGIDO
const statusText = $("statusText");    // CORREGIDO
const statusTitle = $("statusTitle");  // CORREGIDO

// Días permitidos dinámicos (se llenan desde Firestore::settings/visitStatus)
let AM_ALLOWED = new Set();
let PM_ALLOWED = new Set();

// ==========================
//  Mensajería corta (Sin cambios)
// ==========================
function setFormMsg(text, kind = "") {
  formMsg.textContent = text || "";
  formMsg.className =
    "text-sm mt-1 " +
    (kind === "error" ? "text-red-600" :
     kind === "warn"  ? "text-amber-600" : "text-zinc-600");
}

// ==========================
//  PWA: Service Worker (Sin cambios)
// ==========================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

// ==========================
//  Estado de visita (abre/cierra formulario) - Adaptado a Firebase
// ==========================
async function loadStatusAndConfigure() {
  try {
    // Leemos el documento "visitStatus" de la colección "settings"
    const statusDocRef = doc(db, "settings", "visitStatus");
    const statusDocSnap = await getDoc(statusDocRef);

    const s = statusDocSnap.exists() ? statusDocSnap.data() : null;

    if (!s || s.state !== "active") {
      form.classList.add("hidden");
      statusBox.classList.remove("hidden");

      if (!s) {
        statusTitle.textContent = "Sin fecha programada";
        statusText.textContent = "Aún no se pueden hacer reservaciones. ¡Gracias por estar atento!";
        return;
      }

      if (s.state === "scheduled") {
        statusTitle.textContent = "Reservas aún no abiertas";
        statusText.textContent = s.message || "Vuelve pronto.";
      } else if (s.state === "concluded") {
        statusTitle.textContent = "La visita concluyó";
        statusText.textContent = s.message || "Aún no hay fecha de la próxima visita.";
      } else {
        statusTitle.textContent = "Sin fecha programada";
        statusText.textContent = s.message || "Aún no hay fecha de la próxima visita.";
      }
      return;
    }

    // ACTIVO → mostrar formulario con límites
    statusBox.classList.add("hidden");
    form.classList.remove("hidden");

    if (s.start_date) dateInput.min = s.start_date;
    if (s.end_date)   dateInput.max = s.end_date;

    AM_ALLOWED = new Set((s.am_days || []).map(Number));
    PM_ALLOWED = new Set((s.pm_days || []).map(Number));

  } catch (err) {
    console.error("Error loading status:", err);
    form.classList.add("hidden");
    statusBox.classList.remove("hidden");
    statusTitle.textContent = "Estado no disponible";
    statusText.textContent = "No se pudo cargar el estado. Intenta más tarde.";
  }
}

// ==========================
//  Lógica de slots y disponibilidad - Adaptado a Firebase
// ==========================
function updateAllowedSlots() {
  const d = dateInput.value;
  if (!d) return;

  const dow = new Date(d + "T00:00").getDay();
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

  // Reemplazamos la llamada RPC con una query a la colección 'reservas'
  const q = query(collection(db, "reservas"),
    where("date", "==", d),
    where("slot", "==", slotSelect.value)
  );

  try {
    const querySnapshot = await getDocs(q);
    const taken = new Set();
    querySnapshot.forEach((doc) => {
      taken.add(doc.data().person);
    });

    if (taken.has("SC")) {
      optSC.disabled = true;
      optSC.textContent = "Superintendente de Circuito — Ocupado";
    }
    if (taken.has("Esposa")) {
      optEsposa.disabled = true;
      optEsposa.textContent = "Esposa del SC — Ocupado";
    }
  } catch (error) {
    setFormMsg("No se pudo verificar disponibilidad.", "error");
    console.error(error);
  }

  updateSubmitState();
}

// ==========================
//  Listeners (Sin cambios)
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

  try {
    await addDoc(collection(db, "reservas"), payload);
    // Éxito
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
  } catch (error) {
    // Firestore no tiene un error de "duplicado" como Supabase (23505).
    // Cualquier error al escribir se considera un fallo.
    console.error("Error al guardar:", error);
    form.classList.add("hidden");
    errorBox.classList.remove("hidden");
    personSelect.value = "";
    await checkAvailability();
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
  await loadStatusAndConfigure();
  if (!form.classList.contains("hidden")) {
    if (dateInput.value) updateAllowedSlots();
    checkAvailability();
  }
})();