// ===== Firebase SDK Imports =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ===== Firebase Config =====
// Pega aquí tu objeto firebaseConfig de la consola de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCkQisqMEqmKrAbhBPl0xroQQFZFYT0TkY",
  authDomain: "reserva-sc.firebaseapp.com",
  projectId: "reserva-sc",
  storageBucket: "reserva-sc.firebasestorage.app",
  messagingSenderId: "651352627398",
  appId: "1:651352627398:web:8120205020de4f6a89dfc7",
  measurementId: "G-3KZTLF3SBB",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const ADMIN_EMAIL = "biosistem@gmail.com";
const ADMIN_EMAIL_NORMALIZED = ADMIN_EMAIL.trim().toLowerCase();

// ===== UI refs (CORREGIDO) =====
const $ = (id) => document.getElementById(id);

const loginBox = $("loginBox");
const appBox = $("appBox");
const emailInput = $("email");
const passwordInput = $("password");
const showPassword = $("showPassword");
const loginBtn = $("loginBtn");
const loginMsg = $("loginMsg");

const titleInput = $("title");
const saveTitleBtn = $("saveTitleBtn");
const titleMsg = $("titleMsg");
const openAtInput = $("openAt");          // <-- CORREGIDO
const startDateInput = $("startDate");    // <-- CORREGIDO
const endDateInput = $("endDate");        // <-- CORREGIDO
const visitStartDateInput = $("visitStartDate");
const visitEndDateInput = $("visitEndDate");
const amDaysBox = $("amDays");
const pmDaysBox = $("pmDays");

const openNowBtn = $("openNowBtn");
const scheduleBtn = $("scheduleBtn");      // <-- CORREGIDO
const closeBtn = $("closeBtn");            // <-- CORREGIDO
const saveWindowBtn = $("saveWindowBtn");  // <-- CORREGIDO
const appMsg = $("appMsg");                // <-- CORREGIDO
const stateBadge = $("stateBadge");        // <-- CORREGIDO
const stateDesc = $("stateDesc");          // <-- CORREGIDO
const stateSummary = $("stateSummary");
const logoutBtn = $("logoutBtn");          // <-- CORREGIDO
const reservasTbody = $("reservasTbody");
const resName = $("resName");
const resDate = $("resDate");
const resSlot = $("resSlot");
const resPerson = $("resPerson");
const resUpdateBtn = $("resUpdateBtn");
const resClearBtn = $("resClearBtn");
const resDeleteAllBtn = $("resDeleteAllBtn");
const resMsg = $("resMsg");
const confirmModal = $("confirmModal");
const confirmText = $("confirmText");
const confirmYesBtn = $("confirmYesBtn");
const confirmNoBtn = $("confirmNoBtn");

const STATUS_DOC = doc(db, "settings", "visitStatus");
let currentReservaId = null;
const DAY_LABELS = { 1: "L", 2: "M", 3: "X", 4: "J", 5: "V", 6: "S", 0: "D" };
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// ===== Helpers (Sin cambios) =====
const DAYS = [
  { label: "L", value: 1 },
  { label: "M", value: 2 },
  { label: "X", value: 3 },
  { label: "J", value: 4 },
  { label: "V", value: 5 },
  { label: "S", value: 6 },
  { label: "D", value: 0 }
];

function buildDays(container, name) {
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < DAYS.length; i++) {
    const day = DAYS[i];
    const label = document.createElement("label");
    label.className = "flex items-center gap-1";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(day.value);
    cb.dataset.group = name;
    if (day.value === 2) {
      cb.disabled = true;
      label.className += " text-zinc-400";
      label.title = "Martes no disponible.";
    }
    label.appendChild(cb);
    label.appendChild(document.createTextNode(day.label));
    container.appendChild(label);
  }
}
buildDays(amDaysBox, "am");
buildDays(pmDaysBox, "pm");

function getCheckedSet(group) {
  return new Set(
    [...document.querySelectorAll(`input[type="checkbox"][data-group="${group}"]:checked`)]
      .map(cb => Number(cb.value))
  );
}
function setChecked(group, values = []) {
  const set = new Set((values || []).map(Number));
  document.querySelectorAll(`input[type="checkbox"][data-group="${group}"]`).forEach(cb => {
    cb.checked = set.has(Number(cb.value));
  });
}
function setBadge(state) {
  const map = {
    active: "bg-green-600",
    scheduled: "bg-amber-600",
    concluded: "bg-zinc-600",
    noscheduled: "bg-zinc-600"
  };
  stateBadge.textContent = state || "—";
  stateBadge.className = `px-2 py-0.5 rounded-lg text-white text-xs ${map[state] || "bg-zinc-600"}`;
}
function msg(el, text, kind="") {
  el.textContent = text || "";
  el.className = "text-sm mt-2 " + (
    kind === "error" ? "text-red-600" :
    kind === "ok"    ? "text-green-700" : "text-zinc-600"
  );
}

function formatDayList(values = []) {
  const unique = [...new Set((values || []).map(Number).filter((d) => d !== 2))];
  const order = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7 };
  unique.sort((a, b) => (order[a] || 99) - (order[b] || 99));
  if (!unique.length) return "—";
  return unique.map((d) => DAY_LABELS[d] || String(d)).join(", ");
}

function formatOpenAtForSummary(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const day = d.getDate();
  const month = MONTHS_ES[d.getMonth()] || "";
  const hours24 = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "p.m." : "a.m.";
  const hour12 = (hours24 % 12) || 12;
  return `${day} de ${month} a las ${hour12}:${minutes}:${seconds} ${ampm}`;
}

function formatDateEs(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const month = MONTHS_ES[m - 1] || "";
  return `${d} de ${month}`;
}

function formatRangeEs(start, end) {
  if (!start || !end) return "—";
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  if (!ys || !ms || !ds || !ye || !me || !de) return `${start} al ${end}`;
  if (ys === ye && ms === me) {
    return `${ds} al ${de} de ${MONTHS_ES[ms - 1] || ""}`;
  }
  return `${formatDateEs(start)} al ${formatDateEs(end)}`;
}

function formatStateLabel(state) {
  const map = {
    active: "Abierta",
    scheduled: "Programada",
    concluded: "Cerrada",
    noscheduled: "Sin programar"
  };
  return map[state] || "—";
}

function renderStateSummary(data = {}) {
  if (!stateSummary) return;
  const lines = [
    "Ventana de reservas:",
    `- Titulo: ${data.title || "—"}`,
    "- Periodo de visita:",
    `${formatRangeEs(data.visit_start_date, data.visit_end_date)}`,
    "- Reservas del:",
    `${formatRangeEs(data.start_date, data.end_date)}`,
    `- Dias AM (citas): ${formatDayList(data.am_days || [])}`,
    `- Dias PM (citas): ${formatDayList(data.pm_days || [])}`,
    "",
    "Publicacion:",
    `- Estado: ${formatStateLabel(data.state)}`,
    "- Publicar el:",
    `${formatOpenAtForSummary(data.open_at_summary || "")}`
  ];
  stateSummary.textContent = lines.join("\n");
}

function readWindowValues() {
  return {
    start: startDateInput?.value || "",
    end: endDateInput?.value || "",
    visitStart: visitStartDateInput?.value || "",
    visitEnd: visitEndDateInput?.value || ""
  };
}

function validateWindowValues() {
  const { start, end, visitStart, visitEnd } = readWindowValues();
  if (!start || !end) return "Define inicio y fin de reservas.";
  if (!visitStart || !visitEnd) return "Define inicio y fin de visita.";
  if (start > end) return "El inicio de reservas no puede ser mayor al fin.";
  if (visitStart > visitEnd) return "El inicio de visita no puede ser mayor al fin.";
  return "";
}

function askConfirm(text) {
  return new Promise((resolve) => {
    if (!confirmModal || !confirmText || !confirmYesBtn || !confirmNoBtn) {
      resolve(window.confirm(text));
      return;
    }
    confirmText.textContent = text;
    confirmModal.classList.remove("hidden");

    const close = (value) => {
      confirmModal.classList.add("hidden");
      confirmYesBtn.removeEventListener("click", onYes);
      confirmNoBtn.removeEventListener("click", onNo);
      confirmModal.removeEventListener("click", onBackdrop);
      resolve(value);
    };
    const onYes = () => close(true);
    const onNo = () => close(false);
    const onBackdrop = (e) => {
      if (e.target === confirmModal) close(false);
    };

    confirmYesBtn.addEventListener("click", onYes);
    confirmNoBtn.addEventListener("click", onNo);
    confirmModal.addEventListener("click", onBackdrop);
  });
}

// ===== Auth (email + password) =====
async function checkSession() {
  // onAuthStateChanged es el listener principal de Firebase
  onAuthStateChanged(auth, async (user) => {
    const userEmail = (user?.email || "").trim().toLowerCase();
    if (user && userEmail === ADMIN_EMAIL_NORMALIZED) {
      loginBox.classList.add("hidden");
      appBox.classList.remove("hidden");
      await bootstrapData();
    } else if (user) {
      msg(loginMsg, "Este correo no tiene acceso.", "error");
      await signOut(auth);
      loginBox.classList.remove("hidden");
      appBox.classList.add("hidden");
    } else {
      loginBox.classList.remove("hidden");
      appBox.classList.add("hidden");
    }
  });
}

loginBtn?.addEventListener("click", async () => {
  const email = (emailInput.value || "").trim().toLowerCase();
  const password = (passwordInput?.value || "").trim();

  if (!email || !password) {
    msg(loginMsg, "Escribe correo y contraseña.", "error");
    return;
  }
  if (email !== ADMIN_EMAIL_NORMALIZED) {
    msg(loginMsg, "Solo el administrador puede acceder.", "error");
    return;
  }

  msg(loginMsg, "Ingresando...");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    if (passwordInput) passwordInput.value = "";
    msg(loginMsg, "Acceso correcto.", "ok");
  } catch (error) {
    const code = error?.code || "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      msg(loginMsg, "Correo o contraseña incorrectos.", "error");
    } else if (code === "auth/too-many-requests") {
      msg(loginMsg, "Demasiados intentos. Espera un momento e intenta de nuevo.", "error");
    } else {
      msg(loginMsg, `No se pudo iniciar sesión (${code || "sin-codigo"}).`, "error");
    }
    console.error("Login error:", code, error);
  }
});


passwordInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    loginBtn?.click();
  }
});

showPassword?.addEventListener("change", () => {
  if (!passwordInput) return;
  passwordInput.type = showPassword.checked ? "text" : "password";
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    msg(loginMsg, "");
    loginBox.classList.remove("hidden");
    appBox.classList.add("hidden");
  } catch (error) {
    msg(appMsg, "No se pudo cerrar sesión.", "error");
    console.error("Logout error:", error);
  }
});

// ===== Data bootstrap =====
async function bootstrapData() {
  try {
    const statusDocSnap = await getDoc(STATUS_DOC);
    if (statusDocSnap.exists()) {
      const s = statusDocSnap.data();
      setBadge(s.state);
      stateDesc.textContent =
        s.state === "active"    ? "La visita esta abierta. El formulario es visible."
      : s.state === "scheduled" ? "Apertura programada; aun no abre."
      : s.state === "concluded" ? "La visita concluyo."
      : "Aun no hay visita programada.";

      titleInput.value = s.title || "Visita SC";
      startDateInput.value = s.start_date || "";
      endDateInput.value = s.end_date || "";
      visitStartDateInput.value = s.visit_start_date || "";
      visitEndDateInput.value = s.visit_end_date || "";

      let openAtIso = "";
      if (s.open_at?.toDate) {
        openAtIso = s.open_at.toDate().toISOString().slice(0, 16);
      } else if (s.open_at?.seconds) {
        openAtIso = new Date(s.open_at.seconds * 1000).toISOString().slice(0, 16);
      }
      openAtInput.value = openAtIso;

      setChecked("am", s.am_days || []);
      setChecked("pm", s.pm_days || []);
      renderStateSummary({ ...s, open_at_summary: openAtIso });
    } else {
      setBadge("noscheduled");
      stateDesc.textContent = "Aun no hay visita programada.";
      titleInput.value = "Visita SC";
      openAtInput.value = "";
      startDateInput.value = "";
      endDateInput.value = "";
      visitStartDateInput.value = "";
      visitEndDateInput.value = "";
      setChecked("am", []);
      setChecked("pm", []);
      renderStateSummary({});
    }
  } catch (err) {
    console.error("Error loading status:", err);
    setBadge("noscheduled");
    stateDesc.textContent = "No se pudo leer el estado.";
    renderStateSummary({});
  }

  await loadReservasAdmin();
}

function clearReservaForm() {
  currentReservaId = null;
  if (resName) resName.value = "";
  if (resDate) resDate.value = "";
  if (resSlot) resSlot.value = "AM";
  if (resPerson) resPerson.value = "SC";
  if (resMsg) msg(resMsg, "");
}

async function loadReservasAdmin() {
  if (!reservasTbody) return;
  reservasTbody.innerHTML = "";
  try {
    const q = query(collection(db, "reservas"), orderBy("date", "asc"));
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const r = docSnap.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.date || ""}</td>
        <td>${r.slot || ""}</td>
        <td>${r.person || ""}</td>
        <td>${r.name || ""}</td>
        <td>
          <button data-edit="${docSnap.id}" class="px-2 py-1 border rounded">Editar</button>
          <button data-delete="${docSnap.id}" class="px-2 py-1 border rounded">Eliminar</button>
        </td>
      `;
      reservasTbody.appendChild(tr);
    });
  } catch (error) {
    console.error("Error fetching reservas:", error);
    msg(resMsg, "No se pudieron cargar las reservas.", "error");
  }
}

reservasTbody?.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("button[data-edit]");
  const delBtn = e.target.closest("button[data-delete]");
  if (!editBtn && !delBtn) return;

  if (delBtn) {
    const id = delBtn.dataset.delete;
    if (!id) return;
    const ok = confirm("Eliminar esta reserva?");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "reservas", id));
      msg(resMsg, "Reserva eliminada.", "ok");
      if (currentReservaId === id) clearReservaForm();
      await loadReservasAdmin();
    } catch (error) {
      console.error(error);
      msg(resMsg, "No se pudo eliminar.", "error");
    }
    return;
  }

  if (editBtn) {
    const id = editBtn.dataset.edit;
    if (!id) return;
    try {
      const snap = await getDoc(doc(db, "reservas", id));
      if (!snap.exists()) return;
      const r = snap.data();
      currentReservaId = id;
      resName.value = r.name || "";
      resDate.value = r.date || "";
      resSlot.value = r.slot || "AM";
      resPerson.value = r.person || "SC";
      msg(resMsg, "Editando reserva seleccionada.", "ok");
    } catch (error) {
      console.error(error);
      msg(resMsg, "No se pudo cargar la reserva.", "error");
    }
  }
});

resUpdateBtn?.addEventListener("click", async () => {
  if (!currentReservaId) {
    msg(resMsg, "Selecciona una reserva para editar.", "error");
    return;
  }
  const payload = {
    name: (resName.value || "").trim(),
    date: resDate.value,
    slot: resSlot.value,
    person: resPerson.value
  };
  if (!payload.name || !payload.date || !payload.slot || !payload.person) {
    msg(resMsg, "Completa todos los campos.", "error");
    return;
  }
  try {
    await updateDoc(doc(db, "reservas", currentReservaId), payload);
    msg(resMsg, "Reserva actualizada.", "ok");
    await loadReservasAdmin();
  } catch (error) {
    console.error(error);
    msg(resMsg, "No se pudo actualizar.", "error");
  }
});

resClearBtn?.addEventListener("click", () => {
  clearReservaForm();
});

resDeleteAllBtn?.addEventListener("click", async () => {
  const ok = confirm("Seguro que quieres borrar todas las reservas?");
  if (!ok) return;
  try {
    const snap = await getDocs(collection(db, "reservas"));
    const deletes = [];
    snap.forEach((docSnap) => {
      deletes.push(deleteDoc(doc(db, "reservas", docSnap.id)));
    });
    await Promise.all(deletes);
    msg(resMsg, "Todas las reservas fueron eliminadas.", "ok");
    clearReservaForm();
    await loadReservasAdmin();
  } catch (error) {
    console.error(error);
    msg(resMsg, "No se pudieron borrar todas las reservas.", "error");
  }
});

// ===== Actions - Adaptados a Firebase =====
openNowBtn?.addEventListener("click", async () => {
  const windowError = validateWindowValues();
  if (windowError) { msg(appMsg, windowError, "error"); return; }
  try {
    await setDoc(STATUS_DOC, { state: "active", open_at: serverTimestamp() }, { merge: true });
    msg(appMsg, "Visita abierta desde ahora.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(appMsg, "No se pudo abrir.", "error");
    console.error(error);
  }
});

scheduleBtn?.addEventListener("click", async () => {
  const windowError = validateWindowValues();
  if (windowError) { msg(appMsg, windowError, "error"); return; }
  if (!openAtInput.value) { msg(appMsg, "Selecciona fecha/hora en 'Publicar en'.", "error"); return; }
  try {
    await setDoc(STATUS_DOC, { state: "scheduled", open_at: new Date(openAtInput.value) }, { merge: true });
    msg(appMsg, "Apertura programada.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(appMsg, "No se pudo programar apertura.", "error");
    console.error(error);
  }
});

closeBtn?.addEventListener("click", async () => {
  try {
    await setDoc(STATUS_DOC, { state: "concluded" }, { merge: true });
    msg(appMsg, "Visita cerrada.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(appMsg, "No se pudo cerrar.", "error");
    console.error(error);
  }
});

// Bloque corregido en admin.js
saveWindowBtn?.addEventListener("click", async () => {
  const windowError = validateWindowValues();
  if (windowError) { msg(appMsg, windowError, "error"); return; }
  const { start, end, visitStart, visitEnd } = readWindowValues();

  const confirmationText = `Desea guardar el inicio de reservas del ${formatRangeEs(start, end)}?`;
  const confirmed = await askConfirm(confirmationText);
  if (!confirmed) {
    msg(appMsg, "Corregir: no se guardaron cambios.", "warn");
    return;
  }

  const am = [...getCheckedSet("am")].filter((d) => d !== 2);
  const pm = [...getCheckedSet("pm")].filter((d) => d !== 2);

  const payload = {
    title: titleInput.value || "Visita SC",
    start_date: start,
    end_date: end,
    visit_start_date: visitStart,
    visit_end_date: visitEnd,
    am_days: am,
    pm_days: pm
  };
  try {
    await setDoc(STATUS_DOC, payload, { merge: true });
    msg(appMsg, "Rango y dias guardados.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(appMsg, "No se pudo guardar.", "error");
    console.error(error);
  }
});

saveTitleBtn?.addEventListener("click", async () => {
  const title = (titleInput?.value || "").trim();
  if (!title) {
    msg(titleMsg, "Escribe un titulo antes de actualizar.", "error");
    msg(appMsg, "Escribe un titulo antes de actualizar.", "error");
    return;
  }
  const confirmed = await askConfirm(`Desea actualizar el titulo a \"${title}\"?`);
  if (!confirmed) {
    msg(titleMsg, "Corregir: no se actualizo el titulo.", "warn");
    msg(appMsg, "Corregir: no se actualizo el titulo.", "warn");
    return;
  }
  try {
    const statusSnap = await getDoc(STATUS_DOC);
    if (statusSnap.exists()) {
      await updateDoc(STATUS_DOC, { title });
    } else {
      await setDoc(STATUS_DOC, { title }, { merge: true });
    }
    titleInput.value = title;
    msg(titleMsg, "Titulo actualizado.", "ok");
    msg(appMsg, "Titulo actualizado.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(titleMsg, "No se pudo actualizar el titulo.", "error");
    msg(appMsg, "No se pudo actualizar el titulo.", "error");
    console.error(error);
  }
});

// ===== Help modal (Sin cambios) =====
const helpBtn   = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const helpClose = document.getElementById("helpClose");
const helpClose2 = document.getElementById("helpClose2");
const helpCopy  = document.getElementById("helpCopy");

function openHelp(){ helpModal?.classList.remove("hidden"); }
function closeHelp(){ helpModal?.classList.add("hidden"); }

helpBtn?.addEventListener("click", openHelp);
helpClose?.addEventListener("click", closeHelp);
helpClose2?.addEventListener("click", closeHelp);
helpModal?.addEventListener("click", (e) => {
  if (e.target === helpModal) closeHelp();
});

helpCopy?.addEventListener("click", async () => {
  const steps = [
    "1) Define Inicio de visita y Fin de visita (periodo base).",
    "2) Configura Titulo, Inicio/Fin de reservas y dias AM/PM. Pulsa Guardar rango/dias.",
    "3) Si solo cambia el visitante, edita Titulo y pulsa Actualizar nombre.",
    "4) Publica ahora con Abrir ahora, o programa con Publicar en + Programar apertura.",
    "5) Verifica Estado actual y Resumen guardado.",
    "6) En la pagina publica, si esta Abierta (o Programada y ya llego la hora), podran reservar.",
    "7) Para terminar, pulsa Cerrar visita."
  ].join("\n");
  try { await navigator.clipboard.writeText(steps); } catch {}
});

// ===== Start =====
(async function start() {
  await checkSession();
})();





