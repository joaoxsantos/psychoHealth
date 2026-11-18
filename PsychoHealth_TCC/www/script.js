/* =========================================================
   PSYCHOHEALTH — JAVASCRIPT
   Este arquivo controla interações, modais, diário,
   check-ins, acessibilidade e persistência local.
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const PROFILE_KEY = "psychoProfile";
const SESSION_KEY = "psychoProfileSession";
function readLocalProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    return profile && typeof profile.name === "string" && typeof profile.email === "string" ? profile : null;
  } catch { return null; }
}
// A localStorage profile is legacy data, never proof of authentication.
let legacyProfile = readLocalProfile();
let currentProfile = null;
let isAuthenticated = false;

/* ---------- Loader ---------- */
window.addEventListener("load", () => {
  setTimeout(() => $("#loader").classList.add("hide"), 650);
});

/* ---------- Navegação por abas ---------- */
function activateTab(name, focusPanel = false) {
  if (!isAuthenticated && name !== "inicio") return;
  const selected = $(`[data-tab="${name}"]`);
  const panel = $(`[data-page="${name}"]`);
  if (!selected || !panel) return;
  $$("[data-page]").forEach(page => { page.hidden = page !== panel; });
  $$("[data-tab]").forEach(tab => {
    const active = tab === selected;
    tab.setAttribute("aria-selected", String(active));
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  if (focusPanel) panel.focus();
}

function showToolsList(focusFirstCard = false) {
  const overview = $("#ferramentas");
  overview.hidden = false;
  $$("#pagina-ferramentas [data-tool-view]").forEach(view => { view.hidden = true; });
  if (focusFirstCard) {
    const firstCard = overview.querySelector("[data-open-tool]");
    firstCard?.focus();
    overview.scrollIntoView({ block: "start" });
  }
}

function openTool(name) {
  if (!isAuthenticated) { showAuthGate(); return; }
  const view = document.querySelector('[data-tool-view="' + name + '"]');
  if (!view) return;
  $("#ferramentas").hidden = true;
  $$("#pagina-ferramentas [data-tool-view]").forEach(tool => { tool.hidden = tool !== view; });
  view.querySelector("[data-back-tools]")?.focus({ preventScroll: true });
  view.scrollIntoView({ block: "start" });
}

function activateForHash(hash) {
  if (!hash) return;
  const target = document.getElementById(decodeURIComponent(hash.slice(1)));
  const page = target?.closest("[data-page]");
  if (page) {
    if (!isAuthenticated) { showAuthGate(); return; }
    activateTab(page.dataset.page);
    if (page.dataset.page === "ferramentas") {
      if (target.matches("[data-tool-view]")) openTool(target.dataset.toolView);
      else showToolsList();
    }
  }
}

$("#mainNav").addEventListener("click", e => {
  const tab = e.target.closest("[data-tab]");
  if (!tab) return;
  activateTab(tab.dataset.tab);
  if (tab.dataset.tab === "ferramentas") showToolsList();
});

$("#mainNav").addEventListener("keydown", e => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  const tabs = [...$$("#mainNav [role=tab]")];
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  e.preventDefault();
  const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (current + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
});

document.addEventListener("click", e => {
  const toolCard = e.target.closest("[data-open-tool]");
  if (toolCard) {
    e.preventDefault();
    openTool(toolCard.dataset.openTool);
    history.replaceState(null, "", toolCard.hash);
    return;
  }
  const backButton = e.target.closest("[data-back-tools]");
  if (backButton) {
    showToolsList(true);
    history.replaceState(null, "", "#ferramentas");
    return;
  }
  const link = e.target.closest('a[href^="#"]');
  if (!link || link.matches("[data-tab]")) return;
  const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
  const page = target?.closest("[data-page]");
  if (page) activateTab(page.dataset.page);
});
window.addEventListener("hashchange", () => activateForHash(location.hash));
activateForHash(location.hash);
if (!location.hash) activateTab("inicio");

/* ---------- Tema e preferências ---------- */
const settings = JSON.parse(localStorage.getItem("psychoSettings") || "{}");
// Preserve opt-in reminders while moving existing devices to the fixed 07:00/19:00 schedule.
if (settings.reminderVersion !== 2) {
  settings.reminder = settings.reminderVersion === 1 && settings.reminder === true;
  settings.reminderVersion = 2;
  localStorage.setItem("psychoSettings", JSON.stringify(settings));
}
function uiLocale() { return settings.language === "en" ? "en-US" : settings.language === "es" ? "es-ES" : "pt-BR"; }
const uiTranslations = {
  en: { "Início":"Home", "Psicólogos":"Psychologists", "Ferramentas":"Tools", "Meu perfil":"My profile", "Configurações":"Settings", "Entrar":"Sign in", "Preferências":"Preferences", "Modo escuro":"Dark mode", "Acessibilidade":"Accessibility", "Texto ampliado":"Larger text", "Alto contraste":"High contrast", "Dados deste protótipo":"Prototype data", "Idioma do aplicativo":"App language", "Lembrete diário de humor":"Daily mood reminder", "Horário diário":"Daily time", "Início do período silencioso":"Quiet hours start", "Fim do período silencioso":"Quiet hours end", "Apagar dados locais":"Delete local data", "SEUS DADOS":"YOUR DATA", "← Voltar ao início":"← Back to home", "Nome ou nome social":"Name or preferred name", "E-mail":"Email", "Idade ou faixa etária":"Age or age range", "Pronomes (opcional)":"Pronouns (optional)", "Idioma preferido":"Preferred language", "Fuso horário":"Time zone", "Salvar alterações":"Save changes", "Sair deste perfil":"Sign out of this profile", "Adicionar foto ou avatar":"Add a photo or avatar", "Remover foto":"Remove photo", "Prefiro não informar":"Prefer not to say", "TECNOLOGIA + CUIDADO HUMANO":"TECHNOLOGY + HUMAN CARE", "Seu bem-estar merece":"Your well-being deserves", "atenção todos os dias.":"daily attention.", "Entrar ou criar perfil":"Sign in or create a profile", "Conhecer profissionais":"Meet professionals", "✓ Privacidade local":"✓ Local privacy", "✓ Interface acessível":"✓ Accessible interface", "✓ Foco no bem-estar":"✓ Well-being focused", "Como você está hoje?":"How are you feeling today?", "Salvar check-in de hoje":"Save today's check-in", "Psicólogos perto de mim":"Psychologists near me", "Preparando seu espaço de cuidado...":"Preparing your care space...", "Criar perfil":"Create profile", "Já tenho perfil":"I already have a profile", "Entre ou crie seu perfil":"Sign in or create your profile", "Para continuar, cadastre um perfil neste aparelho ou acesse o perfil local já salvo.":"To continue, create a profile on this device or access your saved local profile.", "Criar perfil e continuar":"Create profile and continue", "Acessar perfil local":"Access local profile", "Nome":"Name", "PsychoHealth | Cuidado que conecta":"PsychoHealth | Care that connects", "Altera o idioma da navegação e das configurações principais.":"Changes the language of navigation and main settings.", "Deixe o PsychoHealth do seu jeito.":"Make PsychoHealth yours.", "Perfil, diário, humor, check-ins, autocuidado e metas usam":"Profile, diary, mood, check-ins, self-care, and goals use", ". Os dados ficam apenas neste navegador e não sincronizam entre aparelhos. O perfil local não é uma conta autenticada.":". Data stays in this browser and is not synced between devices. A local profile is not an authenticated account.", "A notificação é local e usa o horário deste celular. Se o horário escolhido cair no período silencioso, ela será enviada ao final desse período. Disponível no app Android.":"This is a local notification using this phone's time. If the selected time falls within quiet hours, it will be sent when quiet hours end. Available in the Android app." },
  es: { "Início":"Inicio", "Psicólogos":"Psicólogos", "Ferramentas":"Herramientas", "Meu perfil":"Mi perfil", "Configurações":"Configuración", "Entrar":"Ingresar", "Preferências":"Preferencias", "Modo escuro":"Modo oscuro", "Acessibilidade":"Accesibilidad", "Texto ampliado":"Texto ampliado", "Alto contraste":"Alto contraste", "Dados deste protótipo":"Datos de este prototipo", "Idioma do aplicativo":"Idioma de la aplicación", "Lembrete diário de humor":"Recordatorio diario del estado de ánimo", "Horário diário":"Horario diario", "Início do período silencioso":"Inicio del período silencioso", "Fim do período silencioso":"Fin del período silencioso", "Apagar dados locais":"Borrar datos locales", "SEUS DADOS":"TUS DATOS", "← Voltar ao início":"← Volver al inicio", "Nome ou nome social":"Nombre o nombre elegido", "E-mail":"Correo electrónico", "Idade ou faixa etária":"Edad o grupo de edad", "Pronomes (opcional)":"Pronombres (opcional)", "Idioma preferido":"Idioma preferido", "Fuso horário":"Zona horaria", "Salvar alterações":"Guardar cambios", "Sair deste perfil":"Salir de este perfil", "Adicionar foto ou avatar":"Añadir foto o avatar", "Remover foto":"Eliminar foto", "Prefiro não informar":"Prefiero no decirlo", "TECNOLOGIA + CUIDADO HUMANO":"TECNOLOGÍA + CUIDADO HUMANO", "Seu bem-estar merece":"Tu bienestar merece", "atenção todos os dias.":"atención todos los días.", "Entrar ou criar perfil":"Ingresar o crear perfil", "Conhecer profissionais":"Conocer profesionales", "✓ Privacidade local":"✓ Privacidad local", "✓ Interface acessível":"✓ Interfaz accesible", "✓ Foco no bem-estar":"✓ Enfoque en el bienestar", "Como você está hoje?":"¿Cómo te sientes hoy?", "Salvar check-in de hoje":"Guardar registro de hoy", "Psicólogos perto de mim":"Psicólogos cerca de mí", "Preparando seu espaço de cuidado...":"Preparando tu espacio de cuidado...", "Criar perfil":"Crear perfil", "Já tenho perfil":"Ya tengo un perfil", "Entre ou crie seu perfil":"Ingresa o crea tu perfil", "Para continuar, cadastre um perfil neste aparelho ou acesse o perfil local já salvo.":"Para continuar, crea un perfil en este dispositivo o accede al perfil local guardado.", "Criar perfil e continuar":"Crear perfil y continuar", "Acessar perfil local":"Acceder al perfil local", "Nome":"Nombre", "PsychoHealth | Cuidado que conecta":"PsychoHealth | Cuidado que conecta", "Altera o idioma da navegação e das configurações principais.":"Cambia el idioma de la navegación y de los ajustes principales.", "Deixe o PsychoHealth do seu jeito.":"Personaliza PsychoHealth a tu manera.", "Perfil, diário, humor, check-ins, autocuidado e metas usam":"El perfil, el diario, el estado de ánimo, los registros, el autocuidado y las metas usan", ". Os dados ficam apenas neste navegador e não sincronizam entre aparelhos. O perfil local não é uma conta autenticada.":". Los datos permanecen en este navegador y no se sincronizan entre dispositivos. El perfil local no es una cuenta autenticada.", "A notificação é local e usa o horário deste celular. Se o horário escolhido cair no período silencioso, ela será enviada ao final desse período. Disponível no app Android.":"La notificación es local y usa la hora de este teléfono. Si la hora elegida coincide con el período silencioso, se enviará al finalizar. Disponible en la aplicación Android." }
};
const reminderDescription = "A notificação é local e usa o horário deste celular. Se o horário escolhido cair no período silencioso, ela será enviada ao final desse período. Disponível no app Android; a economia de bateria pode causar pequeno atraso.";
uiTranslations.en[reminderDescription] = "This is a local notification using this phone's time. If the selected time falls within quiet hours, it will be sent when quiet hours end. Available in the Android app; battery optimization may cause a short delay.";
uiTranslations.es[reminderDescription] = "La notificación es local y usa la hora de este teléfono. Si la hora elegida coincide con el período silencioso, se enviará al finalizar. Disponible en la aplicación Android; el ahorro de batería puede causar un breve retraso.";
const originalTextNodes = new WeakMap();
const originalAttributes = new WeakMap();
function translatedPhrase(phrase, dictionary) {
  let canonical = phrase;
  for (const language of ["en", "es"]) {
    const source = uiTranslations[language] || {};
    const exact = Object.keys(source).find(key => source[key] === phrase);
    if (exact) { canonical = exact; break; }
    const translatedPrefix = Object.keys(source).find(key => key.endsWith(" ") && source[key].endsWith(" ") && phrase.startsWith(source[key]));
    if (translatedPrefix) { canonical = translatedPrefix + phrase.slice(source[translatedPrefix].length); break; }
  }
  if (dictionary?.[canonical]) return dictionary[canonical];
  const prefix = Object.keys(dictionary || {}).find(key => key.endsWith(" ") && canonical.startsWith(key));
  return prefix ? dictionary[prefix] + canonical.slice(prefix.length) : canonical;
}
function applyLanguage() {
  const language = ["en", "es"].includes(settings.language) ? settings.language : "pt-BR";
  document.documentElement.lang = language;
  const dictionary = uiTranslations[language];
  document.title = translatedPhrase("PsychoHealth | Cuidado que conecta", dictionary);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!originalTextNodes.has(node)) originalTextNodes.set(node, node.nodeValue);
    const original = originalTextNodes.get(node), phrase = original.trim();
    if (phrase) {
      const localized = original.replace(phrase, translatedPhrase(phrase, dictionary));
      if (node.nodeValue !== localized) node.nodeValue = localized;
    }
  }
  const attributeNames = ["placeholder", "aria-label", "aria-description", "title", "alt"];
  document.body.querySelectorAll("*").forEach(element => {
    let originals = originalAttributes.get(element);
    if (!originals) { originals = new Map(); originalAttributes.set(element, originals); }
    for (const name of attributeNames) {
      if (!element.hasAttribute(name)) continue;
      if (!originals.has(name)) originals.set(name, element.getAttribute(name));
      element.setAttribute(name, translatedPhrase(originals.get(name), dictionary));
    }
  });
  const labels = { "tab-inicio":"Início", "tab-psicologos":"Psicólogos", "tab-ferramentas":"Ferramentas", "tab-perfil":"Meu perfil", "tab-configuracoes":"Configurações" };
  for (const [id, phrase] of Object.entries(labels)) { const el = document.getElementById(id); if (el) { el.setAttribute("aria-label", dictionary?.[phrase] || phrase); el.title = dictionary?.[phrase] || phrase; } }
}
function saveSettings() { localStorage.setItem("psychoSettings", JSON.stringify(settings)); }

function applySettings() {
  document.body.classList.toggle("dark", !!settings.dark);
  document.body.classList.toggle("high-contrast", !!settings.contrast);
  document.documentElement.style.setProperty("--font-scale", settings.font ? "1.12" : "1");

  $("#darkToggle").checked = !!settings.dark;
  $("#reminderToggle").checked = !!settings.reminder;
  $("#fontToggle").checked = !!settings.font;
  $("#contrastToggle").checked = !!settings.contrast;
  $("#appLanguage").value = settings.language || "pt-BR";
  $$(".brand-symbol, .loader-logo-image").forEach(image => {
    image.src = settings.dark ? "assets/logo_darktheme-removebg-preview.png" : "assets/logo_lighttheme-removebg-preview.png";
  });
  const authLogo = $(".auth-logo");
  if (authLogo) authLogo.src = settings.dark ? "assets/logo_darktheme-removebg-preview.png" : "assets/logo_lighttheme-removebg-preview.png";
  applyLanguage();
}
applySettings();

function toggleTheme() {
  settings.dark = !settings.dark;
  localStorage.setItem("psychoSettings", JSON.stringify(settings));
  applySettings();
}
$("#themeBtn").addEventListener("click", toggleTheme);
$("#authThemeBtn").addEventListener("click", toggleTheme);

[
  ["darkToggle", "dark"],
  ["fontToggle", "font"], ["contrastToggle", "contrast"]
].forEach(([id, key]) => {
  $("#" + id).addEventListener("change", e => {
    settings[key] = e.target.checked;
    localStorage.setItem("psychoSettings", JSON.stringify(settings));
    applySettings();
  });
});

$("#passwordForm").addEventListener("submit", async event => {
  event.preventDefault();
  const currentPassword=$("#currentPassword").value, newPassword=$("#newPassword").value, confirmation=$("#confirmNewPassword").value;
  const message=$("#passwordMessage"); message.textContent="";
  if(newPassword.length<10){message.textContent="A nova senha precisa ter pelo menos 10 caracteres.";return;}
  if(newPassword!==confirmation){message.textContent="A confirmação não corresponde à nova senha.";return;}
  try {
    const result=await PsychoAPI.post("/api/auth/change-password",{currentPassword,newPassword});
    event.currentTarget.reset(); message.textContent=result.message; toast(result.message);
  } catch(error) { message.textContent=error.message; }
});

$("#togglePasswordSection").addEventListener("click", event => {
  const form=$("#passwordForm"), button=event.currentTarget;
  form.hidden=!form.hidden;
  button.setAttribute("aria-expanded",String(!form.hidden));
  if(!form.hidden) { $("#currentPassword").focus(); form.scrollIntoView({block:"nearest",behavior:"smooth"}); }
});

$("#appLanguage").addEventListener("change", e => { settings.language = e.target.value; saveSettings(); applyLanguage(); refreshProfileLanguageText(); window.dispatchEvent(new Event("psychohealth:languagechange")); });

const CHECKIN_NOTIFICATION_IDS = [741201, 741202];
function reminderPlugin() { return window.Capacitor?.Plugins?.LocalNotifications; }
function nextReminderDate(hour) {
  const date = new Date(); date.setHours(hour, 0, 0, 0);
  if (date <= new Date()) date.setDate(date.getDate() + 1);
  return date;
}
async function scheduleMoodReminder() {
  const plugin = reminderPlugin();
  if (!plugin) throw new Error("local-notifications-unavailable");
  let permission = await plugin.checkPermissions();
  if (permission.display !== "granted") permission = await plugin.requestPermissions();
  if (permission.display !== "granted") throw new Error("notification-permission-denied");
  await plugin.cancel({ notifications: CHECKIN_NOTIFICATION_IDS.map(id => ({ id })) });
  const language = settings.language;
  const title = language === "en" ? "PsychoHealth · Daily check-in" : language === "es" ? "PsychoHealth · Registro diario" : "PsychoHealth · Check-in diário";
  const body = language === "en" ? "Take a moment to record how you are feeling today." : language === "es" ? "Tómate un momento para registrar cómo te sientes hoy." : "Reserve um momento para registrar como você está se sentindo hoje.";
  await plugin.schedule({ notifications: [7, 19].map((hour, index) => ({
    id: CHECKIN_NOTIFICATION_IDS[index], title, body,
    schedule: { at: nextReminderDate(hour), repeats: true, allowWhileIdle: true },
    isExactNotification: false
  })) });
}
async function cancelMoodReminder() {
  await reminderPlugin()?.cancel({ notifications: CHECKIN_NOTIFICATION_IDS.map(id => ({ id })) });
}
if (settings.reminder && reminderPlugin()) {
  scheduleMoodReminder().catch(error => console.warn("Falha ao atualizar os horários fixos do lembrete:", error));
}
$("#reminderToggle").addEventListener("change", async event => {
  if (!event.target.checked) {
    settings.reminder = false; saveSettings();
    try { await cancelMoodReminder(); } catch (error) { console.warn("Falha ao cancelar lembrete local:", error); }
    return;
  }
  try {
    await scheduleMoodReminder();
    settings.reminder = true; saveSettings();
    toast(settings.language === "en" ? "Daily reminder enabled." : settings.language === "es" ? "Recordatorio diario activado." : "Lembrete diário ativado.");
  } catch (error) {
    settings.reminder = false; event.target.checked = false; saveSettings();
    const message = error.message === "local-notifications-unavailable"
      ? (settings.language === "en" ? "Install the Android app to use daily notifications." : settings.language === "es" ? "Instala la aplicación Android para usar notificaciones diarias." : "Instale o app Android para usar notificações diárias.")
      : (settings.language === "en" ? "Notification permission was not granted." : settings.language === "es" ? "No se concedió permiso para notificaciones." : "A permissão para notificações não foi concedida.");
    toast(message);
  }
});
/* ---------- Modal ---------- */
const overlay = $("#modalOverlay");
function openModal(title, body, icon = "Ψ") {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = body;
  $("#modalIcon").textContent = icon;
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
}
function closeModal() {
  if (window.activeChatPoll) { clearInterval(window.activeChatPoll); window.activeChatPoll = null; }
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
}
$("#closeModal").addEventListener("click", closeModal);
overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ---------- Perfil local e entrada obrigatória do protótipo ---------- */
function setAuthMode(mode) {
  const create = mode === "signup";
  $("#signupForm").hidden = !create;
  $("#signinForm").hidden = create;
  $("#showSignup").setAttribute("aria-pressed", String(create));
  $("#showSignin").setAttribute("aria-pressed", String(!create));
  $("#authMessage").textContent = "";
}

function showAuthGate(mode = "signup") {
  $("#authGate").hidden = false;
  setAuthMode(mode);
}

function updateAccessUI() {
  const gate = $("#authGate");
  gate.hidden = isAuthenticated;
  document.body.classList.toggle("auth-required", !isAuthenticated);
  [$(".topbar"), $("#mainNav"), $("#conteudo-principal"), $("#panicBtn"), $("footer")].forEach(element => {
    element.inert = !isAuthenticated;
    element.setAttribute("aria-hidden", String(!isAuthenticated));
  });
  $("#loginBtn").textContent = isAuthenticated ? "Meu perfil" : "Entrar";
  $("#heroAuthBtn").innerHTML = isAuthenticated ? 'Meu perfil <span aria-hidden="true">→</span>' : 'Entrar ou criar perfil <span aria-hidden="true">→</span>';
  if (isAuthenticated && currentProfile) {
    $("#profileName").value = currentProfile.name;
    $("#profileEmail").value = currentProfile.email;
    $("#profileGreeting").textContent = settings.language === "en" ? `Hello, ${currentProfile.name}. Your personal records are stored in this server's database.` : settings.language === "es" ? `Hola, ${currentProfile.name}. Tus registros personales se guardan en la base de datos de este servidor.` : `Olá, ${currentProfile.name}. Seus registros pessoais ficam no banco deste servidor.`;
    $("#profileAge").value = currentProfile.age || "";
    $("#profilePronouns").value = currentProfile.pronouns || "";
    $("#profileLanguage").value = currentProfile.language || "pt-BR";
    $("#profileTimezone").value = currentProfile.timezone || "America/Sao_Paulo";
    $("#profileCreatedAt").textContent = (settings.language === "en" ? "Profile created on " : settings.language === "es" ? "Perfil creado el " : "Perfil criado em ") + new Intl.DateTimeFormat(uiLocale(), { dateStyle: "long" }).format(new Date(currentProfile.createdAt || Date.now())) + ".";
    renderProfileAvatar();
  }
}

function refreshProfileLanguageText() {
  if (!isAuthenticated || !currentProfile) return;
  $("#profileGreeting").textContent = settings.language === "en" ? `Hello, ${currentProfile.name}. Your personal records are saved in this server's database.` : settings.language === "es" ? `Hola, ${currentProfile.name}. Tus registros se guardan en la base de datos de este servidor.` : `Olá, ${currentProfile.name}. Seus registros pessoais ficam no banco deste servidor.`;
  $("#profileCreatedAt").textContent = (settings.language === "en" ? "Profile created on " : settings.language === "es" ? "Perfil creado el " : "Perfil criado em ") + new Intl.DateTimeFormat(uiLocale(), { dateStyle: "long" }).format(new Date(currentProfile.createdAt || Date.now())) + ".";
}

function finishSignIn(profile) {
  currentProfile = profile;
  isAuthenticated = true;
  updateAccessUI();
  activateTab("inicio");
  history.replaceState(null, "", "#inicio");
  window.dispatchEvent(new CustomEvent("psychohealth:authenticated", { detail: profile }));
  toast("Conta conectada ao servidor local.");
}

async function importLegacyData(profile) {
  if (!legacyProfile || legacyProfile.email?.toLowerCase() !== profile.email?.toLowerCase()) return;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const moods = read("psychoMoodHistory", []);
  const entries = read("psychoDiary", []);
  const goals = read("psychoGoals", []);
  const appointments = read("psychoAppointments", []);
  const selfCare = read("psychoSelfCare", {});
  await PsychoAPI.post("/api/migrate-local", { moods, entries, goals, appointments, selfCare });
}

$("#showSignup").addEventListener("click", () => setAuthMode("signup"));
$("#showSignin").addEventListener("click", () => setAuthMode("signin"));
$("#signupForm").addEventListener("submit", async event => {
  event.preventDefault();
  const name = $("#signupName").value.trim();
  const email = $("#signupEmail").value.trim().toLocaleLowerCase("pt-BR");
  const password = $("#signupPassword").value;
  if (name.length < 2) { $("#authMessage").textContent = "Digite seu nome para continuar."; return; }
  $("#authMessage").textContent = "Criando conta…";
  try {
    const legacyFields = legacyProfile?.email?.toLowerCase() === email ? legacyProfile : {};
    const result = await PsychoAPI.post("/api/auth/register", { name, email, password, age:legacyFields.age || "", pronouns:legacyFields.pronouns || "", language:legacyFields.language || navigator.language || "pt-BR", timezone:legacyFields.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo", avatar:legacyFields.avatar || "" });
    finishSignIn(result.user);
    try { await importLegacyData(result.user); window.dispatchEvent(new CustomEvent("psychohealth:authenticated", { detail:result.user })); }
    catch(error) { toast("Conta criada, mas a importação dos dados antigos falhou: " + error.message + ". Os dados locais foram preservados."); }
  } catch (error) { $("#authMessage").textContent = error.message; }
});
$("#signinForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("#signinEmail").value.trim().toLocaleLowerCase("pt-BR");
  const password = $("#signinPassword").value;
  $("#authMessage").textContent = "Entrando…";
  try {
    const result = await PsychoAPI.post("/api/auth/login", { email, password });
    finishSignIn(result.user);
    try { await importLegacyData(result.user); window.dispatchEvent(new CustomEvent("psychohealth:authenticated", { detail:result.user })); }
    catch(error) { toast("A conta entrou, mas não foi possível importar registros locais: " + error.message + ". Eles foram preservados neste navegador."); }
  }
  catch (error) { $("#authMessage").textContent = error.message; }
});

$("#profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  const name = $("#profileName").value.trim();
  const email = $("#profileEmail").value.trim().toLocaleLowerCase("pt-BR");
  if (name.length < 2) { toast("Digite um nome com pelo menos duas letras."); return; }
  try {
    const result = await PsychoAPI.patch("/api/profile", { name, age: $("#profileAge").value, pronouns: $("#profilePronouns").value.trim(), language: $("#profileLanguage").value, timezone: $("#profileTimezone").value });
    currentProfile = result.profile; updateAccessUI(); toast("Perfil salvo no servidor.");
  } catch (error) { toast(error.message); }
});

function renderProfileAvatar() {
  const image = $("#profileAvatarPreview"), initials = $("#profileAvatarInitials"), remove = $("#removeProfileAvatar");
  if (!image) return;
  image.hidden = !currentProfile?.avatar; initials.hidden = Boolean(currentProfile?.avatar); remove.hidden = !currentProfile?.avatar;
  image.src = currentProfile?.avatar || "";
  initials.textContent = (currentProfile?.name || "PH").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("pt-BR");
}
$("#profileAvatarFile").addEventListener("change", event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (file.size > 1024 * 1024) { toast("Escolha uma imagem de até 1 MB."); event.target.value = ""; return; }
  const reader = new FileReader(); reader.onload = async () => { try { const result = await PsychoAPI.patch("/api/profile", { avatar: reader.result }); currentProfile = result.profile; renderProfileAvatar(); toast("Avatar salvo no servidor."); } catch(error) { toast(error.message); } };
  reader.readAsDataURL(file);
});
$("#removeProfileAvatar").addEventListener("click", async () => { try { const result = await PsychoAPI.patch("/api/profile", { avatar: "" }); currentProfile = result.profile; renderProfileAvatar(); } catch(error) { toast(error.message); } });

async function signOutLocalProfile() {
  try { await PsychoAPI.post("/api/auth/logout"); } catch { /* Limpa a interface mesmo se o servidor caiu. */ }
  currentProfile = null;
  isAuthenticated = false;
  updateAccessUI();
  activateTab("inicio");
  history.replaceState(null, "", "#inicio");
  showAuthGate("signin");
}
$("#logoutBtn").addEventListener("click", signOutLocalProfile);
$("#profileBack").addEventListener("click", () => activateTab("inicio"));
$("#loginBtn").addEventListener("click", () => {
  if (isAuthenticated) activateTab("perfil");
  else showAuthGate();
});
$("#heroAuthBtn").addEventListener("click", () => {
  if (isAuthenticated) activateTab("perfil");
  else showAuthGate();
});
updateAccessUI();
if (legacyProfile) { $("#signupName").value = legacyProfile.name || ""; $("#signupEmail").value = legacyProfile.email || ""; $("#signinEmail").value = legacyProfile.email || ""; }
showAuthGate("signup");
PsychoAPI.get("/api/auth/me").then(async result => {
  currentProfile = result.user; isAuthenticated = true; updateAccessUI();
  try { await importLegacyData(currentProfile); } catch (error) { console.warn("Migração local não concluída:", error); }
  activateForHash(location.hash || "#inicio");
  window.dispatchEvent(new CustomEvent("psychohealth:authenticated", { detail: currentProfile }));
}).catch(() => { currentProfile = null; isAuthenticated = false; updateAccessUI(); showAuthGate("signup"); });

/* ---------- Toast ---------- */
function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  Object.assign(el.style, {
    position:"fixed", left:"50%", bottom:"calc(84px + env(safe-area-inset-bottom))", transform:"translateX(-50%)",
    zIndex:"3000", background:"var(--text)", color:"var(--surface)",
    padding:"12px 18px", borderRadius:"12px", fontWeight:"800",
    boxShadow:"var(--shadow)"
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/* ---------- Rede profissional ligada ao diretório verificado do servidor ---------- */
async function loadProfessionalDirectory() {
  const host = $("#professionalDirectory");
  if (!host) return;
  try {
    const result = await PsychoAPI.get("/api/professionals");
    const professionals = (result.professionals || []).filter(pro => pro.id !== currentProfile?.id);
    if (!professionals.length) {
      host.innerHTML = '<p class="empty">Ainda não há profissionais verificados neste servidor. Você pode usar os cartões de apresentação abaixo ou aguardar novos cadastros.</p>';
      return;
    }
    host.innerHTML = professionals.map(pro => `<article class="pro-card"><div class="avatar">${escapeHTML((pro.name || "PH").split(/\\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase())}</div><div><span class="verified">● Cadastro verificado</span><h3>${escapeHTML(pro.name || "Profissional")}</h3></div><div class="pro-info"><b>Modalidade</b><span>Online</span><b>Especialidade</b><span>${escapeHTML(pro.approach || pro.specialty || "Não informada")}</span><b>Cidade</b><span>${escapeHTML(pro.city || "Não informada")}</span><b>Disponibilidade</b><span>${escapeHTML(pro.availability || "Consulte por mensagem")}</span><b>Valor por sessão</b><span>${pro.sessionFee ? `R$ ${escapeHTML(pro.sessionFee)}` : "A combinar"}</span><b>Apresentação</b><span>${escapeHTML(pro.bio || "")}</span><b>Contato</b><span>${escapeHTML(pro.email || "Não informado")}</span></div><div class="pro-footer"><button class="outline-btn" data-real-chat="${escapeHTML(pro.email)}" data-pro-name="${escapeHTML(pro.name || "Profissional")}">Enviar mensagem</button><button class="outline-btn" data-real-book="${escapeHTML(pro.id)}" data-pro-name="${escapeHTML(pro.name || "Profissional")}">Solicitar horário</button></div></article>`).join("");
    host.querySelectorAll("[data-real-chat]").forEach(button => button.addEventListener("click", () => openProfessionalChat(button.dataset.realChat, button.dataset.proName)));
    host.querySelectorAll("[data-real-book]").forEach(button => button.addEventListener("click", () => {
      activateTab("ferramentas"); openTool("agenda");
      const field = $("#appointmentPsychologist");
      if (field && ![...field.options].some(option => option.dataset.professionalId === button.dataset.realBook)) { const option = new Option(button.dataset.proName, button.dataset.realBook); option.dataset.professionalId = button.dataset.realBook; field.add(option); }
      if (field) field.value = button.dataset.realBook;
      toast("Escolha data e horário para enviar uma solicitação ao profissional.");
    }));
  } catch (error) { host.innerHTML = `<p class="empty">Não foi possível carregar o diretório: ${escapeHTML(error.message)}</p>`; }
}
window.addEventListener("psychohealth:authenticated", loadProfessionalDirectory);
async function loadProfessionalInbox() {
  const panel = $("#professionalInbox");
  if (!panel) return;
  const isProfessional = currentProfile?.role === "professional";
  panel.hidden = !isProfessional;
  $("#professionalApply").hidden = isProfessional;
  if (!isProfessional) return;
  try {
    const [appointmentData, chatData] = await Promise.all([PsychoAPI.get("/api/appointments"), PsychoAPI.get("/api/chats")]);
    const appointments = appointmentData.appointments.filter(item => item.professional_id === currentProfile.id && item.status === "pending");
    $("#professionalAppointmentInbox").innerHTML = appointments.length ? appointments.map(item => `<article class="goal-item"><b>${escapeHTML(item.patient?.name || "Usuário")}</b><p>${escapeHTML(item.starts_at.replace("T", " às "))} · ${escapeHTML(item.duration_minutes)} min · ${escapeHTML(item.modality)}</p><button class="primary-btn" data-confirm-appointment="${escapeHTML(item.id)}">Confirmar horário</button></article>`).join("") : '<p class="empty">Nenhuma solicitação pendente.</p>';
    $("#professionalAppointmentInbox").querySelectorAll("[data-confirm-appointment]").forEach(button => button.addEventListener("click", async () => {
      try { await PsychoAPI.patch("/api/appointments/" + encodeURIComponent(button.dataset.confirmAppointment), { status:"confirmed" }); toast("Horário confirmado."); await loadProfessionalInbox(); }
      catch(error) { toast(error.message); }
    }));
    const threads = chatData.threads || [];
    $("#professionalChatInbox").innerHTML = threads.length ? threads.map(item => `<button class="tool-card" data-open-thread="${escapeHTML(item.id)}" data-counterpart="${escapeHTML(item.counterpart?.name || "Usuário")}">${escapeHTML(item.counterpart?.name || "Usuário")} · Abrir conversa →</button>`).join("") : '<p class="empty">Nenhuma conversa.</p>';
    $("#professionalChatInbox").querySelectorAll("[data-open-thread]").forEach(button => button.addEventListener("click", () => openProfessionalChat("", button.dataset.counterpart, button.dataset.openThread)));
  } catch(error) { $("#professionalAppointmentInbox").textContent = error.message; }
}
window.addEventListener("psychohealth:authenticated", loadProfessionalInbox);
function validCpfClient(value) {
  const cpf=String(value||"").replace(/\D/g,"");
  if(cpf.length!==11||/^([0-9])\1{10}$/.test(cpf))return false;
  const digit=(base,factor)=>{let sum=0;for(const char of base)sum+=Number(char)*factor--;const rest=(sum*10)%11;return rest===10?0:rest;};
  return digit(cpf.slice(0,9),10)===Number(cpf[9])&&digit(cpf.slice(0,10),11)===Number(cpf[10]);
}
$("#professionalApply")?.addEventListener("click", () => {
  openModal("Solicitar perfil profissional", `<p>Preencha as informações para análise. O CPF e o registro profissional ficam privados e não aparecem no diretório.</p><form id="professionalApplication" class="modal-form"><label for="professionalName">Nome</label><input id="professionalName" maxlength="80" autocomplete="name" required value="${escapeHTML(currentProfile?.name || "")}"><label for="professionalCpf">CPF</label><input id="professionalCpf" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00" required><label for="professionalEmail">E-mail de contato</label><input id="professionalEmail" type="email" maxlength="254" autocomplete="email" required value="${escapeHTML(currentProfile?.email || "")}"><label for="professionalLicense">Registro profissional (CRP)</label><input id="professionalLicense" maxlength="50" required><label for="professionalApproach">Especialidade</label><input id="professionalApproach" maxlength="100" placeholder="Ex.: TCC, humanista" required><label for="professionalCity">Cidade</label><input id="professionalCity" maxlength="100" required><label for="professionalAvailability">Disponibilidade de horários</label><textarea id="professionalAvailability" maxlength="1200" rows="3" placeholder="Ex.: segundas e quartas, das 14h às 19h" required></textarea><label for="professionalFee">Valor por sessão (R$)</label><input id="professionalFee" type="number" min="0" max="100000" step="0.01" required><label for="professionalBio">Apresentação profissional</label><textarea id="professionalBio" maxlength="1200" rows="4" required></textarea><button class="primary-btn" type="submit">Enviar para análise</button></form>`);
  $("#professionalApplication").addEventListener("submit", async event => {
    event.preventDefault();
    const cpf=$("#professionalCpf").value.replace(/\D/g,"");
    if(!validCpfClient(cpf)) { toast("Confira o CPF informado."); $("#professionalCpf").focus(); return; }
    try { const result = await PsychoAPI.post("/api/professional/application", { name:$("#professionalName").value, cpf, email:$("#professionalEmail").value, licenseNumber:$("#professionalLicense").value, approach:$("#professionalApproach").value, city:$("#professionalCity").value, availability:$("#professionalAvailability").value, sessionFee:Number($("#professionalFee").value), bio:$("#professionalBio").value }); closeModal(); toast(result.message); }
    catch(error) { toast(error.message); }
  });
});

async function openProfessionalChat(email, name, existingThreadId = "") {
  try {
    const thread = existingThreadId ? { id:existingThreadId } : (await PsychoAPI.post("/api/chats", { professionalEmail:email })).thread;
    const result = await PsychoAPI.get("/api/chats/" + encodeURIComponent(thread.id) + "/messages");
    const rows = (result.messages || []).map(item => `<p class="chat-message ${item.sender_id === currentProfile.id ? "mine" : ""}"><b>${item.sender_id === currentProfile.id ? "Você" : escapeHTML(name)}:</b> ${escapeHTML(item.body)}</p>`).join("");
    openModal("Conversa com " + escapeHTML(name), `<p class="privacy-note">Mensagens armazenadas no servidor e visíveis apenas aos participantes da conversa.</p><div class="chat-log" id="chatLog">${rows || '<p class="empty">Envie a primeira mensagem.</p>'}</div><form id="chatForm" class="modal-form"><label for="chatText">Mensagem</label><textarea id="chatText" maxlength="2000" rows="2" required></textarea><button class="primary-btn" type="submit">Enviar</button></form>`);
    if (window.activeChatPoll) clearInterval(window.activeChatPoll);
    window.activeChatPoll = setInterval(async () => {
      if (!overlay.classList.contains("open") || !$("#chatLog")) return;
      try { const fresh = await PsychoAPI.get("/api/chats/" + encodeURIComponent(thread.id) + "/messages"); $("#chatLog").innerHTML = (fresh.messages || []).map(item => `<p class="chat-message ${item.sender_id === currentProfile.id ? "mine" : ""}"><b>${item.sender_id === currentProfile.id ? "Você" : escapeHTML(name)}:</b> ${escapeHTML(item.body)}</p>`).join("") || '<p class="empty">Envie a primeira mensagem.</p>'; }
      catch { /* Mantém as mensagens já carregadas enquanto a conexão retorna. */ }
    }, 5000);
    $("#chatForm").addEventListener("submit", async event => {
      event.preventDefault(); const text = $("#chatText").value.trim(); if (!text) return;
      try { await PsychoAPI.post("/api/chats/" + encodeURIComponent(thread.id) + "/messages", { text }); closeModal(); openProfessionalChat(email, name, thread.id); }
      catch(error) { toast("Mensagem não enviada: " + error.message); }
    });
  } catch(error) { toast("Não foi possível abrir o chat: " + error.message); }
}

window.openMeetRoom = async function openMeetRoom() {
  const meetUrl = "https://meet.google.com/new";
  const browser = window.Capacitor?.Plugins?.Browser;
  if (window.Capacitor?.isNativePlatform?.() && browser?.open) {
    try { await browser.open({ url:meetUrl }); return; }
    catch (error) { console.warn("Não foi possível abrir o navegador do sistema:", error); }
  }
  const opened = window.open(meetUrl, "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(meetUrl);
};

const sampleProfessionals = [
  { id:"ana", name:"Ana Martins", modality:"Online", approach:"Terapia cognitivo-comportamental", city:"São Paulo · SP", availability:"Terças e quintas, das 14h às 19h", fee:140, contact:"ana.martins@psychohealth.test", bio:"Gosto de construir um espaço acolhedor e colaborativo. Nesta apresentação, a Ana trabalha temas de ansiedade, autoestima e estratégias para o cotidiano." },
  { id:"rafael", name:"Rafael Costa", modality:"Online e presencial", approach:"Abordagem humanista", city:"Campinas · SP", availability:"Segundas e quartas, das 9h às 13h", fee:160, contact:"rafael.costa@psychohealth.test", bio:"Rafael valoriza a escuta e o ritmo de cada pessoa. A apresentação aborda estresse, rotina e autoconhecimento." },
  { id:"larissa", name:"Larissa Souza", modality:"Online", approach:"Psicoterapia integrativa", city:"Santos · SP", availability:"Segundas a sextas, das 16h às 20h", fee:150, contact:"larissa.souza@psychohealth.test", bio:"Larissa propõe um espaço de conversa respeitoso. Nesta apresentação, os temas são relações, emoções e habilidades sociais." }
];
window.sampleProfessionals=sampleProfessionals;

function showSampleProfessional(pro) {
  openModal(pro.name, `<div class="provider-detail"><p class="provider-bio">${escapeHTML(pro.bio)}</p><dl><dt>Especialidade</dt><dd>${escapeHTML(pro.approach)}</dd><dt>Cidade</dt><dd>${escapeHTML(pro.city)}</dd><dt>Disponibilidade</dt><dd>${escapeHTML(pro.availability)}</dd><dt>Valor por sessão</dt><dd>R$ ${escapeHTML(pro.fee)} · valor de apresentação</dd><dt>Contato</dt><dd>${escapeHTML(pro.contact)}</dd><dt>Modalidade</dt><dd>${escapeHTML(pro.modality)}</dd></dl><p class="privacy-note">Este perfil não representa uma pessoa real. Mensagens e contatos de demonstração não são enviados a profissionais.</p><div class="provider-detail-actions"><button class="primary-btn" id="sampleChatOpen" type="button">Abrir conversa</button><button class="outline-btn" id="sampleAppointmentOpen" type="button">Adicionar à agenda</button>${pro.modality.includes("Online")?'<button class="outline-btn" id="sampleMeetOpen" type="button">Abrir Google Meet</button>':''}</div></div>`);
  $("#sampleChatOpen").addEventListener("click", () => openSampleChat(pro));
  $("#sampleAppointmentOpen").addEventListener("click", () => {
    closeModal(); activateTab("ferramentas"); openTool("agenda");
    const select=$("#appointmentPsychologist"); if(select)select.value=`sample:${pro.id}`;
    toast("O item será salvo como lembrete pessoal, sem solicitar consulta ao perfil demonstrativo.");
  });
  $("#sampleMeetOpen")?.addEventListener("click", () => window.openMeetRoom());
}

function openSampleChat(pro) {
  const key="psychoSampleChat:"+pro.id;
  let messages=[]; try { messages=JSON.parse(localStorage.getItem(key)||"[]"); } catch {}
  const rows=messages.map(item=>`<p class="chat-message mine"><b>Você:</b> ${escapeHTML(item.text)}</p>`).join("");
  openModal("Conversa demonstrativa · "+pro.name, `<p class="privacy-note">Esta conversa fica neste navegador e não é entregue a uma pessoa. Para conversar de verdade, use o perfil de um profissional verificado.</p><div id="sampleChatLog" class="chat-log">${rows||'<p class="empty">Escreva uma mensagem para a apresentação.</p>'}</div><form id="sampleChatForm" class="modal-form"><label for="sampleChatText">Mensagem</label><textarea id="sampleChatText" maxlength="1000" required rows="3"></textarea><button class="primary-btn" type="submit">Salvar mensagem</button></form>`);
  $("#sampleChatForm").addEventListener("submit", event=>{
    event.preventDefault(); const text=$("#sampleChatText").value.trim(); if(!text)return;
    try { messages=JSON.parse(localStorage.getItem(key)||"[]"); } catch { messages=[]; }
    messages.push({text,createdAt:new Date().toISOString()}); localStorage.setItem(key,JSON.stringify(messages)); openSampleChat(pro);
  });
}

function renderSampleProfessionals() {
  const host=$("#sampleProfessionalDirectory"); if(!host)return;
  host.innerHTML=sampleProfessionals.map(pro=>`<article class="pro-card sample-pro-card"><h3>${escapeHTML(pro.name)}</h3><p>${escapeHTML(pro.modality)}</p><button class="outline-btn" type="button" data-sample-pro="${pro.id}">Ver apresentação</button></article>`).join("");
  host.querySelectorAll("[data-sample-pro]").forEach(button=>button.addEventListener("click",()=>showSampleProfessional(sampleProfessionals.find(pro=>pro.id===button.dataset.samplePro))));
}
renderSampleProfessionals();

/* ---------- Localização aproximada via Google Maps ---------- */
$("#nearbyPsychologists").addEventListener("click", () => {
  const openSearch = locationText => window.open(`https://www.google.com/maps/search/psic%C3%B3logos+perto+de+mim/${locationText || ""}`, "_blank", "noopener,noreferrer");
  if (!navigator.geolocation) { openSearch(""); return; }
  navigator.geolocation.getCurrentPosition(position => {
    const { latitude, longitude } = position.coords;
    openSearch(`@${latitude},${longitude},14z`);
  }, () => openSearch(""), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
});
/* ---------- Avaliação ---------- */
$("#reviewBtn").addEventListener("click", () => {
  openModal("Sua avaliação", `
    <form class="modal-form" id="reviewForm">
      <label>Nota</label>
      <select id="reviewStars" required><option value="">Selecione...</option><option value="5">★★★★★ — 5</option><option value="4">★★★★☆ — 4</option><option value="3">★★★☆☆ — 3</option><option value="2">★★☆☆☆ — 2</option><option value="1">★☆☆☆☆ — 1</option></select>
      <label>Comentário</label>
      <textarea id="reviewText" rows="5" maxlength="500" required placeholder="Conte como foi sua experiência..."></textarea>
      <button class="primary-btn" type="submit">Enviar avaliação</button>
    </form>
  `);
  $("#reviewForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await PsychoAPI.post("/api/reviews", { rating:Number($("#reviewStars").value), comment:$("#reviewText").value.trim() });
      closeModal(); toast("Avaliação salva e enviada para análise.");
    } catch(error) { toast("Não foi possível enviar a avaliação: " + error.message); }
  });
});

/* ---------- SOS / suporte ---------- */
$("#panicBtn").addEventListener("click", () => {
  openModal("SOS — demonstração", `
    <p>Esta função está disponível apenas para demonstração. O aplicativo não realiza chamadas de emergência.</p>
  `, "SOS");
});

/* ---------- Diário virtual ---------- */
const diaryKey = "psychoDiary";
let entries;
try {
  const storedEntries = JSON.parse(localStorage.getItem(diaryKey) || "[]");
  entries = Array.isArray(storedEntries) ? storedEntries : [];
} catch { entries = []; }
let editingEntryId = null;
let diaryQuery = "";
entries = entries.map(entry => ({ ...entry, id: entry.id || (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`) }));
localStorage.setItem(diaryKey, JSON.stringify(entries));

function renderEntries() {
  const list = $("#entriesList");
  const visibleEntries = entries
    .filter(entry => `${entry.title || ""} ${entry.text || ""}`.toLocaleLowerCase("pt-BR").includes(diaryQuery))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (!visibleEntries.length) {
    if (diaryQuery) { list.innerHTML = '<p class="empty">Nenhum registro corresponde à sua busca.</p>'; return; }
    list.innerHTML = '<p class="empty">Nenhum registro salvo ainda.</p>';
    return;
  }
  list.innerHTML = visibleEntries.map(entry => `
    <article class="entry">
      <small>${escapeHTML(localizedEntryDate(entry))}</small>
      <h4>${escapeHTML(entry.title || "Sem título")}</h4>
      <p>${escapeHTML(entry.text)}</p>
      <div class="entry-actions"><button class="entry-action" data-edit-entry="${escapeHTML(entry.id)}">Editar</button><button class="entry-action danger" data-delete-entry="${escapeHTML(entry.id)}">Excluir</button></div>
    </article>
  `).join("");

  $$("[data-delete-entry]").forEach(btn => btn.addEventListener("click", () => {
    const id = btn.dataset.deleteEntry;
    openModal("Excluir este registro?", `<p>Esta ação remove este texto deste dispositivo.</p><button class="danger-btn" id="confirmDeleteEntry">Excluir registro</button>`);
    $("#confirmDeleteEntry").addEventListener("click", async () => {
      try { await PsychoAPI.delete("/api/journal/" + encodeURIComponent(id)); } catch(error) { toast("Não foi possível excluir do servidor: " + error.message); return; }
      entries = entries.filter(entry => entry.id !== id);
      localStorage.setItem(diaryKey, JSON.stringify(entries));
      closeModal(); renderEntries(); toast("Registro excluído.");
    });
  }));
  $$ ("[data-edit-entry]").forEach(btn => btn.addEventListener("click", () => {
    const entry = entries.find(item => item.id === btn.dataset.editEntry);
    if (!entry) return;
    editingEntryId = entry.id;
    $("#diaryTitle").value = entry.title || "";
    $("#diaryText").value = entry.text;
    $("#charCount").textContent = `${entry.text.length}/3000`;
    $("#diaryForm button[type=submit]").textContent = "Atualizar registro";
    $("#diaryTitle").focus();
  }));
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[char]));
}

function localizedEntryDate(entry) {
  return entry.createdAt
    ? new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))
    : entry.date;
}

$("#diaryText").addEventListener("input", e => {
  $("#charCount").textContent = `${e.target.value.length}/3000`;
});

const searchInput = document.createElement("input");
searchInput.className = "diary-search";
searchInput.type = "search";
searchInput.placeholder = "Pesquisar por título ou conteúdo";
searchInput.setAttribute("aria-label", "Pesquisar registros do diário");
$("#entriesList").before(searchInput);
searchInput.addEventListener("input", e => { diaryQuery = e.target.value.trim().toLocaleLowerCase("pt-BR"); renderEntries(); });

$("#diaryForm").addEventListener("submit", async e => {
  e.preventDefault();
  const title = $("#diaryTitle").value.trim();
  const text = $("#diaryText").value.trim();
  if (!text) return;
  const now = new Date();
  const wasEditing = Boolean(editingEntryId);
  const values = { title, text, createdAt: now.toISOString(), date: new Intl.DateTimeFormat(uiLocale(), { dateStyle:"medium", timeStyle:"short" }).format(now) };
  const entryId = editingEntryId || window.crypto?.randomUUID?.() || String(Date.now()) + "-" + Math.random();
  if (editingEntryId) {
    entries = entries.map(entry => entry.id === editingEntryId ? Object.assign({}, entry, values) : entry);
    editingEntryId = null;
    $("#diaryForm button[type=submit]").textContent = "Salvar registro";
  } else entries.unshift(Object.assign({ id: entryId }, values));
  try { await PsychoAPI.post("/api/journal", { id:entryId, title, text, createdAt:values.createdAt }); }
  catch(error) { toast("Não foi possível salvar no servidor: " + error.message); return; }
  localStorage.setItem(diaryKey, JSON.stringify(entries));
  e.target.reset();
  $("#charCount").textContent = "0/3000";
  renderEntries();
  toast(wasEditing ? "Registro atualizado no servidor." : "Registro salvo no servidor.");
});
$("#clearDiary").addEventListener("click", () => {
  if (!entries.length) return;
  openModal("Apagar diário?", `<p>Esta ação remove os registros deste navegador.</p><button class="danger-btn" id="confirmClear">Apagar tudo</button>`);
  $("#confirmClear").addEventListener("click", async () => {
    try { await PsychoAPI.delete("/api/journal"); } catch(error) { toast("Não foi possível apagar os registros do servidor: " + error.message); return; }
    entries = [];
    localStorage.removeItem(diaryKey);
    renderEntries();
    closeModal();
    toast("Registros apagados.");
  });
});
renderEntries();
window.addEventListener("psychohealth:authenticated", async () => {
  try { const result = await PsychoAPI.get("/api/journal"); entries = result.entries || []; localStorage.setItem(diaryKey, JSON.stringify(entries)); renderEntries(); }
  catch(error) { console.warn("Diário não carregado do servidor:", error); }
});

/* ---------- Mood rápido do hero ---------- */
function selectHomeMood(mood) {
  $$(".home-checkin-card .moods button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mood === mood)));
}
window.addEventListener("psychohealth:home-mood-loaded", event => selectHomeMood(event.detail?.mood));
selectHomeMood(localStorage.getItem("psychoMood"));
$$(".moods button").forEach(btn => btn.addEventListener("click", () => {
  selectHomeMood(btn.dataset.mood);
  window.dispatchEvent(new CustomEvent("psychohealth:quickmood", { detail: { mood: btn.dataset.mood } }));
  $("#heroMoodText").textContent = `Humor selecionado: ${btn.dataset.mood}.`;
}));

/* ---------- Apagar todos os dados locais ---------- */
$("#exportData").addEventListener("click", async () => {
  const status=$("#privacyStatus"); status.textContent="Preparando seu arquivo de dados…";
  try {
    const [profile,journal,moods,selfCare,goals,appointments,chats]=await Promise.all([
      PsychoAPI.get("/api/profile"), PsychoAPI.get("/api/journal"), PsychoAPI.get("/api/moods"), PsychoAPI.get("/api/self-care"),
      PsychoAPI.get("/api/goals"), PsychoAPI.get("/api/appointments"), PsychoAPI.get("/api/chats")
    ]);
    const conversations=await Promise.all((chats.threads||[]).map(async thread=>({ ...thread, messages:(await PsychoAPI.get(`/api/chats/${encodeURIComponent(thread.id)}/messages`)).messages||[] })));
    const localCopies={};
    for(const key of ["psychoSettings","psychoDiary","psychoMoodHistory","psychoSelfCare","psychoGoals","psychoAppointments"]){const value=localStorage.getItem(key);if(value!==null)localCopies[key]=JSON.parse(value);}
    const payload={exportedAt:new Date().toISOString(),account:profile.profile,journal:journal.entries||[],moods:moods.records||[],selfCare:selfCare.records||[],goals:goals.goals||[],appointments:appointments.appointments||[],chats:conversations,localCopies};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}), url=URL.createObjectURL(blob), link=document.createElement("a");
    link.href=url;link.download=`psychohealth-dados-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url);
    status.textContent="Arquivo JSON baixado. Ele pode conter informações pessoais e registros sensíveis; guarde-o em local seguro.";
  } catch(error) { status.textContent=`Não foi possível exportar os dados: ${error.message}`; }
});

$("#deleteData").addEventListener("click", () => {
  openModal("Apagar dados locais?", `
    <p>Isso apagará cópias locais e preferências deste navegador. Os registros vinculados à sua conta no banco do servidor serão mantidos.</p>
    <button class="danger-btn" id="confirmDelete">Apagar todos os dados</button>
  `);
  $("#confirmDelete").addEventListener("click", () => {
    localStorage.removeItem(diaryKey);
    localStorage.removeItem("psychoMoodHistory");
    localStorage.removeItem("psychoCheckins");
    Object.keys(localStorage).filter(key => key.startsWith("psychoChat:")).forEach(key => localStorage.removeItem(key));
    localStorage.removeItem("psychoMood");
    localStorage.removeItem("psychoSettings");
    entries = [];
    location.reload();
  });
});
