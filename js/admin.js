// ===== Firebase SDK Imports =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, limit, addDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, sendSignInLinkToEmail, signInWithEmailLink, isSignInWithEmailLink, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

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

// ===== UI refs (CORREGIDO) =====
const $ = (id) => document.getElementById(id);

const loginBox = $("loginBox");
const appBox = $("appBox");
const emailInput = $("email");
const sendLinkBtn = $("sendLinkBtn");
const loginMsg = $("loginMsg");

const titleInput = $("title");
const openAtInput = $("openAt");          // <-- CORREGIDO
const startDateInput = $("startDate");    // <-- CORREGIDO
const endDateInput = $("endDate");        // <-- CORREGIDO
const amDaysBox = $("amDays");
const pmDaysBox = $("pmDays");

const openNowBtn = $("openNowBtn");
const scheduleBtn = $("scheduleBtn");      // <-- CORREGIDO
const closeBtn = $("closeBtn");            // <-- CORREGIDO
const saveWindowBtn = $("saveWindowBtn");  // <-- CORREGIDO
const newVisitBtn = $("newVisitBtn");      // <-- CORREGIDO
const appMsg = $("appMsg");                // <-- CORREGIDO
const stateBadge = $("stateBadge");        // <-- CORREGIDO
const stateDesc = $("stateDesc");          // <-- CORREGIDO
const visitsTbody = $("visitsTbody");      // <-- CORREGIDO
const logoutBtn = $("logoutBtn");          // <-- CORREGIDO

let currentVisitId = null;

// ===== Helpers (Sin cambios) =====
const DAYS = ["D","L","M","X","J","V","S"];

function buildDays(container, name) {
  if (!container) return;
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

// ===== Auth (magic link) - Adaptado a Firebase =====
async function checkSession() {
  // onAuthStateChanged es el listener principal de Firebase
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      loginBox.classList.add("hidden");
      appBox.classList.remove("hidden");
      await bootstrapData();
    } else {
      loginBox.classList.remove("hidden");
      appBox.classList.add("hidden");
    }
  });
}

sendLinkBtn?.addEventListener("click", async () => {
  const email = (emailInput.value || "").trim();
  if (!email) { msg(loginMsg, "Escribe tu correo.", "error"); return; }
  msg(loginMsg, "Enviando enlace…");

  const actionCodeSettings = {
    url: window.location.href, // La página a la que redirigirá
    handleCodeInApp: true,
  };

  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem('emailForSignIn', email);
    msg(loginMsg, "Revisa tu correo y abre el enlace para entrar.", "ok");
  } catch (error) {
    msg(loginMsg, "No se pudo enviar el enlace.", "error");
    console.error(error);
  }
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  location.reload(); // Recarga para limpiar el estado
});

// ===== Data bootstrap - Adaptado a Firebase =====
async function bootstrapData() {
  // 1) Estado público
  try {
    // Leemos el documento "visitStatus" de la colección "settings"
    const statusDocRef = doc(db, "settings", "visitStatus");
    const statusDocSnap = await getDoc(statusDocRef);

    if (statusDocSnap.exists()) {
      const s = statusDocSnap.data();
      setBadge(s.state);
      stateDesc.textContent =
        s.state === "active"    ? "La visita está abierta. El formulario es visible."
      : s.state === "scheduled" ? "Inscripciones programadas; aún no abren."
      : s.state === "concluded" ? "La visita concluyó."
      : "Aún no hay visita programada.";
    } else {
      setBadge("noscheduled");
      stateDesc.textContent = "Aún no hay visita programada.";
    }
  } catch (err) {
    console.error("Error loading status:", err);
    setBadge("noscheduled");
    stateDesc.textContent = "No se pudo leer el estado.";
  }

  // 2) Últimas visitas
  try {
    const q = query(collection(db, "visitas"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const querySnapshot = await getDocs(q);

    visitsTbody.innerHTML = "";
    if (!querySnapshot.empty) {
      querySnapshot.forEach((doc) => {
        const v = { id: doc.id, ...doc.data() };
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="border p-2">${v.id}</td>
          <td class="border p-2">${v.title || ""}</td>
          <td class="border p-2">${v.startDate || ""}</td>
          <td class="border p-2">${v.endDate || ""}</td>
          <td class="border p-2">${v.isOpen ? "true" : "false"}</td>
          <td class="border p-2">${v.openAt ? new Date(v.openAt.seconds * 1000).toLocaleString() : ""}</td>
          <td class="border p-2"><button data-id="${v.id}" class="px-2 py-1 border rounded">Editar</button></td>
        `;
        visitsTbody.appendChild(tr);
      });
      // Carga la primera visita de la lista por defecto
      await loadVisitById(querySnapshot.docs[0].id);
    }
  } catch (error) {
    console.error("Error fetching visits:", error);
    msg(appMsg, "No se pudieron cargar las visitas.", "error");
  }
}

// Delegación: click en “Editar”
visitsTbody?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  await loadVisitById(btn.dataset.id);
});

async function loadVisitById(id) {
  try {
    const docRef = doc(db, "visitas", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const v = { id: docSnap.id, ...docSnap.data() };
      currentVisitId = v.id;
      titleInput.value = v.title || "";
      startDateInput.value = v.startDate || "";
      endDateInput.value = v.endDate || "";
      
      if (v.openAt && v.openAt.seconds) {
        const local = new Date(v.openAt.seconds * 1000).toISOString().slice(0, 16);
        openAtInput.value = local;
      } else {
        openAtInput.value = "";
      }

      setChecked("am", v.amDays || []);
      setChecked("pm", v.pmDays || []);
    } else {
      msg(appMsg, "No se pudo cargar la visita.", "error");
    }
  } catch (error) {
    console.error("Error loading visit by ID:", error);
    msg(appMsg, "No se pudo cargar la visita.", "error");
  }
}

// ===== Actions - Adaptados a Firebase =====
openNowBtn?.addEventListener("click", async () => {
  if (!currentVisitId) return;
  try {
    const docRef = doc(db, "visitas", currentVisitId);
    await updateDoc(docRef, { isOpen: true, openAt: serverTimestamp() });
    msg(appMsg, "Visita abierta desde ahora.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(appMsg, "No se pudo abrir.", "error");
    console.error(error);
  }
});

scheduleBtn?.addEventListener("click", async () => {
  if (!currentVisitId || !openAtInput.value) { msg(appMsg, "Selecciona fecha/hora en 'Abrir (open_at)'.", "error"); return; }
  try {
    const docRef = doc(db, "visitas", currentVisitId);
    await updateDoc(docRef, { isOpen: true, openAt: new Date(openAtInput.value) });
    msg(appMsg, "Apertura programada.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(appMsg, "No se pudo programar apertura.", "error");
    console.error(error);
  }
});

closeBtn?.addEventListener("click", async () => {
  if (!currentVisitId) return;
  try {
    const docRef = doc(db, "visitas", currentVisitId);
    await updateDoc(docRef, { isOpen: false });
    msg(appMsg, "Visita cerrada.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(appMsg, "No se pudo cerrar.", "error");
    console.error(error);
  }
});

// Bloque corregido en admin.js
saveWindowBtn?.addEventListener("click", async () => {
  if (!currentVisitId) return;
  const start = startDateInput.value;
  const end = endDateInput.value;
  if (!start || !end) { msg(appMsg, "Define inicio y fin.", "error"); return; }
  const am = [...getCheckedSet("am")];
  const pm = [...getCheckedSet("pm")];

  const payload = {
    title: titleInput.value || "Visita SC",
    start_date: start, // <-- CORREGIDO a snake_case
    end_date: end,   // <-- CORREGIDO a snake_case
    am_days: am,     // <-- CORREGIDO a snake_case
    pm_days: pm      // <-- CORREGIDO a snake_case
  };
  try {
    const docRef = doc(db, "visitas", currentVisitId);
    await updateDoc(docRef, payload);
    msg(appMsg, "Rango/días guardados.", "ok");
    await bootstrapData();
  } catch (error) {
    msg(appMsg, "No se pudo guardar.", "error");
    console.error(error);
  }
});

newVisitBtn?.addEventListener("click", async () => {
  const today = new Date();
  const yyyy = today.getFullYear(), mm = String(today.getMonth()+1).padStart(2,'0'), dd = String(today.getDate()).padStart(2,'0');
  const payload = {
    title: "Nueva visita",
    startDate: `${yyyy}-${mm}-${dd}`,
    endDate: `${yyyy}-${mm}-${dd}`,
    amDays: [3,4,5,6,0],
    pmDays: [3,5],
    isOpen: false,
    createdAt: serverTimestamp() // Usar serverTimestamp es mejor
  };
  try {
    const docRef = await addDoc(collection(db, "visitas"), payload);
    msg(appMsg, "Nueva visita creada.", "ok");
    await bootstrapData();
    await loadVisitById(docRef.id);
  } catch (error) {
    msg(appMsg, "No se pudo crear nueva visita.", "error");
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
    "1) Crear nueva visita (queda cerrada).",
    "2) Configura Título, Inicio/Fin y AM/PM. Pulsa Guardar rango/días.",
    "3) Abrir ahora (visible inmediato) o Programar apertura con fecha/hora.",
    "4) Verifica Estado: active o scheduled.",
    "5) En la pública recarga; si está active y el día aplica, podrán reservar.",
    "6) Al terminar, Cerrar (o deja que pase Fin)."
  ].join("\n");
  try { await navigator.clipboard.writeText(steps); } catch {}
});

// ===== Start - Adaptado a Firebase =====
(async function start() {
  // Comprobar si hay un enlace de inicio de sesión en la URL al cargar la página
  // CAMBIO CLAVE: isSignInWithEmailLink es una función, no un método de `auth`
  if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      email = window.prompt('Por favor, proporciona tu correo para confirmar tu inicio de sesión.');
    }
    if(email) {
      try {
        const result = await signInWithEmailLink(auth, email, window.location.href);
        window.localStorage.removeItem('emailForSignIn');
        // El listener onAuthStateChanged se encargará de mostrar la UI correcta
      } catch (error) {
        console.error("Error signing in with email link", error);
      }
    }
  }
  // Iniciar el listener de estado de autenticación
  await checkSession();
})();