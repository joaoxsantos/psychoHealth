/* Ferramentas pessoais. Cada recurso usa uma chave local própria para facilitar
   uma futura migração para armazenamento sincronizado, com consentimento. */
(() => {
  const $ = selector => document.querySelector(selector);
  const storage = {
    read(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
      catch { return fallback; }
    },
    write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  };
  const uiLocale = () => document.documentElement.lang === "en" ? "en-US" : document.documentElement.lang === "es" ? "es-ES" : "pt-BR";
  const uiLanguage = () => document.documentElement.lang === "en" ? "en" : document.documentElement.lang === "es" ? "es" : "pt-BR";
  const tr = phrase => window.uiTranslate ? window.uiTranslate(phrase) : phrase;
  const dateKey = (date = new Date()) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const readableDate = value => new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium" }).format(new Date(value + "T12:00:00"));
  const moodOptions = [
    { label: "Muito bem", emoji: "😄" },
    { label: "Bem", emoji: "🙂" },
    { label: "Neutro", emoji: "😐" },
    { label: "Triste", emoji: "😔" },
    { label: "Ansioso ou estressado", emoji: "😟" }
  ];
  const translatedMood = label => tr(label);

  /* Registro de humor: um registro por dia, que pode ser atualizado. */
  const moodKey = "psychoMoodHistory";
  let moods = storage.read(moodKey, []);
  if (!Array.isArray(moods)) moods = [];
  const legacyCheckins = storage.read("psychoCheckins", []);
  if (Array.isArray(legacyCheckins) && legacyCheckins.length) {
    const migrated = legacyCheckins.map(item => {
      const match = String(item.date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      const date = match ? `${match[3].length === 2 ? "20" + match[3] : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : dateKey();
      const score = Number(item.score) || 3;
      return {
        date,
        mood: score >= 4.5 ? "Muito bem" : score >= 3.5 ? "Bem" : score >= 2.5 ? "Neutro" : score >= 1.5 ? "Triste" : "Ansioso ou estressado",
        note: [item.word, item.feeling, item.thoughts].filter(Boolean).join(" · "),
        energy: "Moderada",
        help: item.help || "",
        updatedAt: new Date().toISOString()
      };
    }).filter(item => !moods.some(existing => existing.date === item.date));
    moods = [...moods, ...migrated].sort((a, b) => b.date.localeCompare(a.date));
    storage.write(moodKey, moods);
    localStorage.removeItem("psychoCheckins");
  }
  const todayMood = () => moods.find(item => item.date === dateKey());
  const parseThoughtNote = note => {
    const text = String(note || "");
    const match = text.match(/^Situação:\s*([\s\S]*?)\nPensamento:\s*([\s\S]*?)\nReação:\s*([\s\S]*)$/);
    return match ? { situation:match[1], thought:match[2], reaction:match[3] } : { situation:text, thought:"", reaction:"" };
  };
  const buildThoughtNote = () => {
    const parts = [$("#moodNote").value.trim(), $("#moodThought").value.trim(), $("#moodReaction").value.trim()];
    return parts.some(Boolean) ? `Situação: ${parts[0]}\nPensamento: ${parts[1]}\nReação: ${parts[2]}` : "";
  };
  const setMood = async (mood, note = "", energy = "Moderada", help = "", details = {}) => {
    const record = { date: dateKey(), mood, note: String(note).trim(), energy, help: String(help).trim(), emotions: Array.isArray(details.emotions) ? details.emotions : [], stress: Number(details.stress) || 3, sleep: details.sleep || "", updatedAt: new Date().toISOString() };
    moods = [record, ...moods.filter(item => item.date !== record.date)].sort((a, b) => b.date.localeCompare(a.date));
    storage.write(moodKey, moods);
    localStorage.setItem("psychoMood", mood);
    renderMoods();
    if (window.PsychoAPI) {
      try { await PsychoAPI.put("/api/moods", record); if (window.toast) toast("Registro de humor salvo no servidor."); }
      catch (error) { if (window.toast) toast(`Não foi possível salvar no servidor: ${error.message}`); }
    }
  };

  async function loadServerRecords() {
    if (!window.PsychoAPI) return;
    try {
      const [moodData, careData, goalData, appointmentData] = await Promise.all([
        PsychoAPI.get("/api/moods"), PsychoAPI.get("/api/self-care"), PsychoAPI.get("/api/goals"), PsychoAPI.get("/api/appointments")
      ]);
      if (Array.isArray(moodData.records)) {
        moods = moodData.records; storage.write(moodKey, moods); renderMoods();
        const current = todayMood();
        $("#heroMoodText").textContent = current ? `Hoje você registrou: ${current.mood}.` : "Seu humor de hoje ainda não foi registrado.";
      }
      const care = {};
      for (const row of careData.records || []) { care[row.date] ||= {}; care[row.date][row.activity_key] = Boolean(row.done); }
      storage.write("psychoSelfCare", care); renderSelfCare();
      if (Array.isArray(goalData.goals)) { goals = goalData.goals; storage.write("psychoGoals", goals); renderGoals(); }
      if (Array.isArray(appointmentData.appointments)) {
        const normalized = appointmentData.appointments.filter(item => item.patient_id && item.status !== "cancelled").map(item => {
          const [date, time] = item.starts_at.split("T");
          return { id:item.id, date, time, duration:item.duration_minutes, mode:item.modality, note:item.note, psychologist:item.professional?.name || item.professional_label || "Lembrete pessoal", professionalId:item.professional_id || "", status:item.status };
        });
        storage.write("psychoAppointments", normalized); renderAgenda();
      }
    } catch (error) { console.warn("Não foi possível carregar seus registros do servidor:", error); }
  }
  window.addEventListener("psychohealth:authenticated", loadServerRecords);

  function renderMoods() {
    const history = $("#moodHistory");
    if (!history) return;
    $("#moodTodayDate").textContent = new Intl.DateTimeFormat(uiLocale(), { weekday: "short", day: "numeric", month: "short" }).format(new Date());
    const current = todayMood();
    window.dispatchEvent(new CustomEvent("psychohealth:home-mood-loaded", { detail:{ mood:current?.mood || "" } }));
    if (current) {
      const option = [...document.querySelectorAll("[name=dailyMood]")].find(input => input.value === current.mood);
      if (option) option.checked = true;
      const reflection = parseThoughtNote(current.note);
      $("#moodNote").value = reflection.situation;
      $("#moodThought").value = reflection.thought;
      $("#moodReaction").value = reflection.reaction;
      $("#moodEnergy").value = current.energy || "Moderada";
      $("#moodHelp").value = current.help || "";
      $("#moodStress").value = String(current.stress || 3);
      $("#moodSleep").value = current.sleep || "";
      document.querySelectorAll('#moodForm [name="emotions"]').forEach(input => { input.checked = (current.emotions || []).includes(input.value); });
    }
    $("#moodStressValue").textContent = `${$("#moodStress").value} ${uiLanguage() === "en" ? "of" : uiLanguage() === "es" ? "de" : "de"} 5`;
    history.replaceChildren();
    if (!moods.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Se quiser, seu primeiro registro pode começar hoje.";
      history.append(empty);
    } else {
      $("#moodNote").value = ""; $("#moodThought").value = ""; $("#moodReaction").value = "";
      moods.slice(0, 14).forEach(item => {
        const row = document.createElement("article");
        row.className = "mood-history-item";
        const title = document.createElement("b");
        const option = moodOptions.find(m => m.label === item.mood);
        title.textContent = (option?.emoji || "•") + " " + translatedMood(item.mood);
        const date = document.createElement("span");
        date.textContent = readableDate(item.date);
        row.append(title, date);
        if (item.note) {
          const note = document.createElement("small");
          note.textContent = item.note;
          row.append(note);
        }
        if (item.energy || item.help) {
          const details = document.createElement("small");
          details.textContent = [item.energy && `Energia: ${item.energy}`, item.help && `Pode ajudar: ${item.help}`].filter(Boolean).join(" · ");
          row.append(details);
        }
        const reflection = [item.emotions?.length && `${tr("Emoções:")} ${item.emotions.map(tr).join(", ")}`, item.stress && `${tr("Estresse:")} ${item.stress}/5`, item.sleep && `${tr("Sono:")} ${tr(({"1":"Muito ruim","2":"Ruim","3":"Regular","4":"Bom","5":"Muito bom"})[item.sleep] || item.sleep)}`].filter(Boolean).join(" · ");
        if (reflection) { const details = document.createElement("small"); details.textContent = reflection; row.append(details); }
        history.append(row);
      });
    }

    const recentDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - index);
      return dateKey(date);
    });
    const recent = moods.filter(item => recentDates.includes(item.date));
    const counts = moodOptions.map(option => ({ ...option, count: recent.filter(item => item.mood === option.label).length }));
    $("#weeklySummary").textContent = recent.length
      ? (uiLanguage() === "en" ? "This week: " : uiLanguage() === "es" ? "Esta semana: " : "Nesta semana: ") + counts.filter(item => item.count).map(item => item.count + " " + translatedMood(item.label).toLocaleLowerCase(uiLocale())).join(", ") + "."
      : (uiLanguage() === "en" ? "There are no entries this week yet." : uiLanguage() === "es" ? "Todavía no hay registros esta semana." : "Ainda não há registros nesta semana.");
    const chart = $("#moodChart");
    chart.replaceChildren();
    const max = Math.max(1, ...counts.map(item => item.count));
    counts.forEach(item => {
      const row = document.createElement("div");
      row.className = "mood-bar-row";
      const label = document.createElement("span");
      label.textContent = item.emoji + " " + translatedMood(item.label);
      const track = document.createElement("span");
      track.className = "mood-bar-track";
      const bar = document.createElement("span");
      bar.className = "mood-bar";
      bar.style.width = (item.count / max * 100) + "%";
      track.append(bar);
      const count = document.createElement("b");
      count.textContent = String(item.count);
      row.append(label, track, count);
      chart.append(row);
    });
    chart.setAttribute("aria-label", recent.length
      ? (uiLanguage() === "en" ? "Text chart of moods from the last seven days: " : uiLanguage() === "es" ? "Gráfico de texto de los estados de ánimo de los últimos siete días: " : "Gráfico textual dos humores dos últimos sete dias: ") + counts.map(item => translatedMood(item.label) + ": " + item.count).join("; ")
      : (uiLanguage() === "en" ? "No mood entries in the last seven days." : uiLanguage() === "es" ? "No hay registros de ánimo en los últimos siete días." : "Sem registros de humor nos últimos sete dias."));
  }

  $("#moodForm").addEventListener("submit", event => {
    event.preventDefault();
    const mood = new FormData(event.currentTarget).get("dailyMood");
    if (!moodOptions.some(option => option.label === mood)) return;
    const emotions = [...event.currentTarget.querySelectorAll('[name="emotions"]:checked')].map(input => input.value);
    setMood(mood, buildThoughtNote(), $("#moodEnergy").value, $("#moodHelp").value, { emotions, stress: $("#moodStress").value, sleep: $("#moodSleep").value });
    if (!window.PsychoAPI && window.toast) toast("Registro de humor salvo neste dispositivo.");
  });
  window.addEventListener("psychohealth:quickmood", event => {
    const mood = event.detail?.mood;
    if (!moodOptions.some(option => option.label === mood)) return;
    const current = todayMood();
    setMood(mood, current?.note || "", current?.energy || "Moderada", current?.help || "", current || {});
  });
  $("#moodStress").addEventListener("input", event => { $("#moodStressValue").textContent = `${event.target.value} ${uiLanguage() === "en" ? "of" : "de"} 5`; });
  renderMoods();

  /* Lista de autocuidado: marcações independentes para cada dia. */
  const selfCareKey = "psychoSelfCare";
  const activities = [
    ["water", "Beber água", "💧", "Um copo de água já é um começo."],
    ["pause", "Fazer uma pausa", "☁️", "Respire e dê alguns minutos a si."],
    ["music", "Ouvir uma música", "🎵", "Escolha algo que combine com seu momento."],
    ["outside", "Passar um tempo ao ar livre", "☀️", "Uma janela aberta também vale."],
    ["talk", "Conversar com alguém de confiança", "💬", "Você não precisa resolver tudo sozinho."],
    ["organize", "Organizar uma tarefa pequena", "🌱", "Escolha apenas o próximo passo."],
    ["rest", "Reservar um momento para descansar", "🌙", "Descansar também faz parte do cuidado."]
  ];
  function renderSelfCare() {
    const allDays = storage.read(selfCareKey, {});
    const today = allDays[dateKey()] || {};
    const list = $("#selfCareList");
    list.replaceChildren();
    activities.forEach(([id, label, icon, description]) => {
      const wrapper = document.createElement("label");
      wrapper.className = "self-care-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(today[id]);
      checkbox.addEventListener("change", async () => {
        const updated = storage.read(selfCareKey, {});
        updated[dateKey()] ||= {};
        updated[dateKey()][id] = checkbox.checked;
        storage.write(selfCareKey, updated);
        try { await PsychoAPI.put("/api/self-care", { date:dateKey(), activityKey:id, done:checkbox.checked }); } catch(error) { toast(`Falha ao salvar: ${error.message}`); }
        updateSelfCareProgress(updated[dateKey()]);
      });
      const iconBox = document.createElement("span"); iconBox.className = "self-care-icon"; iconBox.setAttribute("aria-hidden", "true"); iconBox.textContent = icon;
      const content = document.createElement("span"); content.className = "self-care-copy";
      const title = document.createElement("strong"); title.textContent = label;
      const detail = document.createElement("small"); detail.textContent = description;
      content.append(title, detail);
      const checkMark = document.createElement("span"); checkMark.className = "self-care-check"; checkMark.setAttribute("aria-hidden", "true"); checkMark.textContent = "✓";
      wrapper.append(checkbox, iconBox, content, checkMark);
      list.append(wrapper);
    });
    updateSelfCareProgress(today);
  }
  function updateSelfCareProgress(today) {
    const done = activities.filter(([id]) => today[id]).length;
    const progressBar = $("#selfCareProgressBar");
    if (progressBar) { progressBar.setAttribute("aria-valuemax", String(activities.length)); progressBar.setAttribute("aria-valuenow", String(done)); $("#selfCareProgressFill").style.width = `${done / activities.length * 100}%`; }
    $("#selfCareProgress").textContent = done
      ? uiLanguage() === "en" ? `${done} of ${activities.length} activities checked. Do only what feels right for you.` : uiLanguage() === "es" ? `${done} de ${activities.length} actividades marcadas. Haz solo lo que te haga bien.` : `${done} de ${activities.length} atividades marcadas. Faça apenas o que for bom para você.`
      : uiLanguage() === "en" ? "No activities checked yet. Choose what feels right; resting is self-care too." : uiLanguage() === "es" ? "Todavía no has marcado ninguna actividad. Elige lo que te resulte útil; descansar también es cuidarse." : "Nenhuma atividade marcada ainda. Escolha apenas o que fizer sentido; descansar também é cuidar de si.";
  }
  renderSelfCare();

  /* Metas sem rankings. Uma confirmação é solicitada antes de cada exclusão. */
  const goalsKey = "psychoGoals";
  let goals = storage.read(goalsKey, []);
  if (!Array.isArray(goals)) goals = [];
  function renderGoals() {
    const list = $("#goalsList");
    list.replaceChildren();
    const ordered = [...goals].sort((a, b) => Number(a.done) - Number(b.done) || String(a.date || "9999").localeCompare(String(b.date || "9999")));
    if (!ordered.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Suas metas ficam aqui. Você pode começar com algo pequeno.";
      list.append(empty);
      return;
    }
    ordered.forEach(goal => {
      const item = document.createElement("article");
      item.className = "goal-item" + (goal.done ? " completed" : "");
      const title = document.createElement("h4");
      title.textContent = goal.title;
      item.append(title);
      if (goal.description) {
        const description = document.createElement("p");
        description.textContent = goal.description;
        item.append(description);
      }
      if (goal.date) {
        const date = document.createElement("small");
        date.textContent = "Data desejada: " + readableDate(goal.date);
        item.append(date);
      }
      const actions = document.createElement("div");
      actions.className = "goal-actions";
      const completion = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(goal.done);
      checkbox.addEventListener("change", async () => {
        goals = goals.map(value => value.id === goal.id ? { ...value, done: checkbox.checked } : value);
        storage.write(goalsKey, goals);
        try { await PsychoAPI.post("/api/goals", goals.find(value => value.id === goal.id)); } catch(error) { toast(`Falha ao salvar: ${error.message}`); }
        renderGoals();
      });
      completion.append(checkbox, document.createTextNode(" Concluída"));
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "entry-action";
      edit.textContent = "Editar";
      edit.addEventListener("click", () => {
        $("#goalTitle").value = goal.title;
        $("#goalDescription").value = goal.description || "";
        $("#goalDate").value = goal.date || "";
        $("#goalForm").dataset.editing = goal.id;
        $("#goalForm button[type=submit]").textContent = "Salvar alterações";
        $("#goalTitle").focus();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "entry-action danger";
      remove.textContent = "Excluir";
      remove.addEventListener("click", async () => {
        if (!window.confirm(tr("Excluir esta meta?"))) return;
        goals = goals.filter(value => value.id !== goal.id);
        storage.write(goalsKey, goals);
        try { await PsychoAPI.delete(`/api/goals/${encodeURIComponent(goal.id)}`); } catch(error) { toast(`Falha ao excluir: ${error.message}`); }
        renderGoals();
      });
      actions.append(completion, edit, remove);
      item.append(actions);
      list.append(item);
    });
  }
  $("#goalForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = $("#goalTitle").value.trim();
    if (!title) return;
    const editingId = form.dataset.editing;
    const goal = {
      id: editingId || (window.crypto?.randomUUID?.() || String(Date.now())),
      title,
      description: $("#goalDescription").value.trim(),
      date: $("#goalDate").value,
      done: editingId ? Boolean(goals.find(item => item.id === editingId)?.done) : false
    };
    goals = editingId ? goals.map(item => item.id === editingId ? goal : item) : [goal, ...goals];
    storage.write(goalsKey, goals);
    try { await PsychoAPI.post("/api/goals", goal); } catch(error) { toast(`Falha ao salvar: ${error.message}`); }
    delete form.dataset.editing;
    form.reset();
    $("#goalForm button[type=submit]").textContent = "Adicionar meta";
    renderGoals();
    if (window.toast) toast(editingId ? "Meta atualizada." : "Meta salva neste dispositivo.");
  });
  renderGoals();

  /* Ciclo guiado visual 4s/6s; o som, se ativado, permanece contínuo. */
  const circle = $("#breathingCircle");
  const cue = $("#breathingCue");
  const status = $("#breathingStatus");
  const startButton = $("#breathingStart");
  const pauseButton = $("#breathingPause");
  const stopButton = $("#breathingStop");
  const duration = $("#breathingDuration");
  const soundToggle = $("#breathingSound");
  const volume = $("#breathingVolume");
  const volumeValue = $("#breathingVolumeValue");
  let remaining = 0;
  let phase = "inhale";
  let phaseRemaining = 4;
  let timer = null;
  let audioContext = null;
  let activeTone = null;
  let activeGain = null;

  function stopTone() {
    if (!activeTone || !audioContext) return;
    const oscillator = activeTone;
    const gain = activeGain;
    activeTone = null;
    activeGain = null;
    const now = audioContext.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.025);
      oscillator.stop(now + 0.12);
    } catch { /* O tom já pode ter terminado naturalmente. */ }
  }

  function playBreathingCue() {
    if (!soundToggle.checked || Number(volume.value) <= 0) return;
    if (activeTone) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      status.textContent = "O áudio não está disponível neste aparelho. Você ainda pode acompanhar as instruções visuais e textuais.";
      return;
    }
    try {
      audioContext ||= new AudioContextClass();
      if (audioContext.state === "suspended") audioContext.resume();
      stopTone();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      const peak = Number(volume.value) / 30 * 0.006;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(196, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.22);
      gain.gain.setValueAtTime(peak, now + 0.23);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      activeTone = oscillator;
      activeGain = gain;
      oscillator.onended = () => {
        if (activeTone === oscillator) { activeTone = null; activeGain = null; }
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(now);
    } catch {
      status.textContent = "Não foi possível iniciar o som. Continue acompanhando o círculo e as instruções na tela.";
    }
  }

  soundToggle.addEventListener("change", () => {
    volume.disabled = !soundToggle.checked;
    if (!soundToggle.checked) stopTone();
    else if (timer) playBreathingCue();
  });
  volume.addEventListener("input", () => {
    volumeValue.value = volume.value + "%";
    volumeValue.textContent = volume.value + "%";
    if (activeGain && audioContext) activeGain.gain.setTargetAtTime(Number(volume.value) / 30 * 0.006, audioContext.currentTime, 0.08);
    if (Number(volume.value) === 0) stopTone();
  });
  function showBreathingPhase() {
    circle.classList.toggle("inhale", phase === "inhale");
    circle.classList.toggle("exhale", phase === "exhale");
      cue.textContent = (phase === "inhale" ? (uiLanguage() === "en" ? "Breathe in gently" : uiLanguage() === "es" ? "Inhala suavemente" : "Inspire suavemente") : (uiLanguage() === "en" ? "Breathe out slowly" : uiLanguage() === "es" ? "Exhala lentamente" : "Expire devagar")) + " · " + phaseRemaining + "s";
      status.textContent = phase === "inhale" ? (uiLanguage() === "en" ? "Breathe in gently through your nose." : uiLanguage() === "es" ? "Inhala suavemente por la nariz." : "Inspire pelo nariz, sem esforço.") : (uiLanguage() === "en" ? "Breathe out at your own pace. You do not need to hold your breath." : uiLanguage() === "es" ? "Exhala a tu ritmo. No necesitas contener la respiración." : "Solte o ar no seu ritmo. Você não precisa prender a respiração.");
  }
  function setBreathingControls(running, paused = false) {
    startButton.disabled = running;
    duration.disabled = running;
    pauseButton.disabled = !running;
    pauseButton.textContent = paused ? "Continuar" : "Pausar";
    stopButton.disabled = !running;
  }
  function stopBreathing(completed = false) {
    clearInterval(timer);
    timer = null;
    stopTone();
    remaining = 0;
    circle.classList.remove("inhale", "exhale");
    cue.textContent = uiLanguage() === "en" ? "Start whenever you're ready" : uiLanguage() === "es" ? "Empieza cuando quieras" : "Quando quiser, comece";
    status.textContent = completed ? (uiLanguage() === "en" ? "Pause complete. Continue at your own pace." : uiLanguage() === "es" ? "Pausa terminada. Continúa a tu ritmo." : "Pausa concluída. Continue no seu ritmo.") : (uiLanguage() === "en" ? "Breathe normally. You can return whenever you like." : uiLanguage() === "es" ? "Respira normalmente. Puedes volver cuando quieras." : "Respire normalmente. Você pode voltar quando quiser.");
    setBreathingControls(false);
  }
  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => {
      remaining--;
      phaseRemaining--;
      if (remaining <= 0) { stopBreathing(true); return; }
      if (phaseRemaining <= 0) {
        phase = phase === "inhale" ? "exhale" : "inhale";
        phaseRemaining = phase === "inhale" ? 4 : 6;
      }
      showBreathingPhase();
    }, 1000);
  }
  startButton.addEventListener("click", () => {
    remaining = Number(duration.value) * 60;
    phase = "inhale";
    phaseRemaining = 4;
    setBreathingControls(true);
    showBreathingPhase();
    playBreathingCue();
    startTimer();
  });
  pauseButton.addEventListener("click", () => {
    if (timer) {
      clearInterval(timer); timer = null;
      stopTone();
      pauseButton.textContent = "Continuar";
      status.textContent = uiLanguage() === "en" ? "Paused. Resume whenever you feel comfortable." : uiLanguage() === "es" ? "En pausa. Reanuda cuando te sientas a gusto." : "Pausa. Retome quando se sentir confortável.";
    } else { playBreathingCue(); startTimer(); }
  });
  stopButton.addEventListener("click", () => stopBreathing(false));

  /* Agenda demonstrativa de consultas, mantida somente neste navegador. */
  const appointmentsKey = "psychoAppointments";
  const calendarGrid = $("#calendarGrid");
  const appointmentForm = $("#appointmentForm");
  const todayKey = dateKey();
  let selectedDay = todayKey;
  let shownMonth = new Date(); shownMonth.setDate(1);
  const readAppointments = () => {
    const value = storage.read(appointmentsKey, []);
    return Array.isArray(value) ? value.filter(item => item && item.date && item.psychologist).map(item => ({ ...item, id: item.id || `${item.date}:${item.time || ""}:${item.psychologist}`, duration: Number(item.duration) || 45, mode: item.mode || "Online" })) : [];
  };
  const writeAppointments = value => storage.write(appointmentsKey, value);
  const dateLabel = value => new Intl.DateTimeFormat(uiLocale(), { dateStyle: "full" }).format(new Date(value + "T12:00:00"));
  function resetAppointmentForm(date = selectedDay) {
    appointmentForm.reset(); $("#appointmentId").value = ""; $("#appointmentDate").value = date;
    $("#appointmentFormTitle").textContent = "Adicionar à agenda"; $("#saveAppointment").textContent = "Salvar na agenda"; $("#cancelAppointmentEdit").hidden = true;
  }
  function editAppointment(item) {
    $("#appointmentId").value = item.id;
    const professionalField=$("#appointmentPsychologist");
    const sampleId=window.sampleProfessionals?.find(pro=>pro.name===item.psychologist)?.id;
    if(item.professionalId&&!Array.from(professionalField.options).some(option=>option.dataset.professionalId===item.professionalId)) { const option=new Option(item.psychologist,item.professionalId); option.dataset.professionalId=item.professionalId; professionalField.add(option); }
    professionalField.value=item.professionalId|| (sampleId?`sample:${sampleId}`:item.psychologist);
    $("#appointmentDate").value = item.date;
    $("#appointmentTime").value = item.time; $("#appointmentDuration").value = String(item.duration || 45); $("#appointmentMode").value = item.mode || "Online"; $("#appointmentNote").value = item.note || "";
    $("#appointmentFormTitle").textContent = "Alterar lembrete pessoal"; $("#saveAppointment").textContent = "Salvar alterações"; $("#cancelAppointmentEdit").hidden = false;
    appointmentForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function cancelAppointment(item) {
    const confirmation = uiLanguage() === "en" ? `Cancel this calendar item for ${item.psychologist} on ${dateLabel(item.date)} at ${item.time}?` : uiLanguage() === "es" ? `¿Cancelar este evento con ${item.psychologist} el ${dateLabel(item.date)} a las ${item.time}?` : `Desmarcar este evento de ${item.psychologist} em ${dateLabel(item.date)} às ${item.time}?`;
    if (!window.confirm(confirmation)) return;
    try { if (item.status === "personal") await PsychoAPI.delete(`/api/appointments/${encodeURIComponent(item.id)}`); else await PsychoAPI.patch(`/api/appointments/${encodeURIComponent(item.id)}`, { status:"cancelled" }); writeAppointments(readAppointments().filter(row => row.id !== item.id)); renderAgenda(); if (window.toast) toast("Agendamento cancelado no servidor."); }
    catch(error) { if (window.toast) toast(`Não foi possível remover: ${error.message}`); }
  }
  function renderCalendar() {
    const year = shownMonth.getFullYear(), month = shownMonth.getMonth();
    $("#calendarMonth").textContent = new Intl.DateTimeFormat(uiLocale(), { month: "long", year: "numeric" }).format(shownMonth);
    const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
    const events = readAppointments(), cells = [];
    for (let index = 0; index < 42; index++) {
      const day = new Date(start); day.setDate(start.getDate() + index); const key = dateKey(day);
      const count = events.filter(item => item.date === key).length;
      const button = document.createElement("button"); button.type = "button";
      button.className = "calendar-day" + (day.getMonth() !== month ? " outside-month" : "") + (key === selectedDay ? " selected" : "") + (key === todayKey ? " today" : "");
      button.setAttribute("aria-pressed", String(key === selectedDay)); button.setAttribute("aria-label", dateLabel(key) + (count ? `, ${count} consulta${count === 1 ? "" : "s"}` : ""));
      const number = document.createElement("span"); number.textContent = String(day.getDate()); button.append(number);
      if (count) { const badge = document.createElement("small"); badge.className = "calendar-event-count"; badge.textContent = String(count); button.append(badge); }
      button.addEventListener("click", () => { selectedDay = key; if (day.getMonth() !== month) { shownMonth = new Date(day.getFullYear(), day.getMonth(), 1); renderCalendar(); } else renderCalendar(); $("#calendarSelectedDate").textContent = dateLabel(key); if (!$("#appointmentId").value) $("#appointmentDate").value = key; renderDayAppointments(); });
      cells.push(button);
    }
    calendarGrid.replaceChildren(...cells);
  }
  function renderDayAppointments() {
    const host = $("#calendarDayEvents"), events = readAppointments().filter(item => item.date === selectedDay).sort((a, b) => String(a.time).localeCompare(String(b.time)));
    $("#calendarSelectedDate").textContent = dateLabel(selectedDay); host.replaceChildren();
    if (!events.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Nenhuma consulta marcada para este dia."; host.append(empty); return; }
    events.forEach(item => {
      const card = document.createElement("article"); card.className = "calendar-event";
      const time = document.createElement("strong"); time.textContent = item.time;
      const title = document.createElement("b"); title.textContent = item.psychologist;
      const detail = document.createElement("small"); detail.textContent = `${item.duration || 45} min · ${tr(item.mode || "Online")}${item.status === "pending" ? " · aguardando confirmação" : item.status === "confirmed" ? " · confirmada" : " · lembrete pessoal"}`;
      const actions = document.createElement("div"); actions.className = "calendar-event-actions";
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "text-btn"; edit.textContent = "Alterar"; edit.disabled = item.status !== "personal"; edit.addEventListener("click", () => editAppointment(item));
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "text-btn danger"; cancel.textContent = "Desmarcar"; cancel.addEventListener("click", () => cancelAppointment(item));
      actions.append(edit, cancel);
      if ((item.status === "personal" || item.status === "confirmed") && String(item.mode).toLocaleLowerCase().includes("online")) {
        const meet = document.createElement("button"); meet.type = "button"; meet.className = "meet-link-btn"; meet.textContent = "Abrir Google Meet"; meet.title = "O Meet abre separadamente; crie e compartilhe a sala manualmente."; meet.addEventListener("click", () => window.openMeetRoom()); actions.append(meet);
      }
      card.append(time, title, detail, actions);
      if (item.note) { const note = document.createElement("small"); note.textContent = item.note; card.append(note); } host.append(card);
    });
  }
  function renderUpcomingAppointments() {
    const host = $("#appointmentUpcoming"), events = readAppointments().filter(item => item.date >= todayKey).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    $("#appointmentCount").textContent = uiLanguage() === "en" ? `${events.length} scheduled` : uiLanguage() === "es" ? `${events.length} programada${events.length === 1 ? "" : "s"}` : `${events.length} agendada${events.length === 1 ? "" : "s"}`; host.replaceChildren();
    if (!events.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "Suas próximas consultas aparecerão aqui."; host.append(empty); return; }
    events.forEach(item => {
      const card = document.createElement("article"); card.className = "upcoming-appointment";
      const date = document.createElement("b"); date.textContent = dateLabel(item.date);
      const details = document.createElement("span"); details.textContent = `${item.time} · ${item.psychologist} · ${tr(item.mode || "Online")}${item.status === "pending" ? " · aguardando confirmação" : item.status === "confirmed" ? " · confirmada" : " · lembrete pessoal"}`;
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "text-btn"; edit.textContent = "Alterar"; edit.disabled = item.status !== "personal"; edit.addEventListener("click", () => { selectedDay = item.date; shownMonth = new Date(item.date + "T12:00:00"); shownMonth.setDate(1); renderAgenda(); editAppointment(item); });
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "text-btn danger"; cancel.textContent = "Desmarcar"; cancel.addEventListener("click", () => cancelAppointment(item));
      card.append(date, details, edit, cancel);
      if ((item.status === "personal" || item.status === "confirmed") && String(item.mode).toLocaleLowerCase().includes("online")) {
        const meet = document.createElement("button"); meet.type = "button"; meet.className = "meet-link-btn"; meet.textContent = "Abrir Google Meet"; meet.title = "O Meet abre separadamente; crie e compartilhe a sala manualmente."; meet.addEventListener("click", () => window.openMeetRoom()); card.append(meet);
      }
      host.append(card);
    });
  }
  function renderAgenda() { renderCalendar(); renderDayAppointments(); renderUpcomingAppointments(); }
  function moveCalendarMonth(offset) {
    shownMonth.setMonth(shownMonth.getMonth() + offset);
    selectedDay = dateKey(new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1));
    if (!$("#appointmentId").value) $("#appointmentDate").value = selectedDay;
    renderAgenda();
  }
  $("#calendarPrev").addEventListener("click", () => moveCalendarMonth(-1));
  $("#calendarNext").addEventListener("click", () => moveCalendarMonth(1));
  $("#calendarToday").addEventListener("click", () => { selectedDay = todayKey; shownMonth = new Date(); shownMonth.setDate(1); resetAppointmentForm(todayKey); renderAgenda(); });
  $("#appointmentDate").min = todayKey; $("#appointmentDate").value = selectedDay;
  $("#appointmentDate").addEventListener("change", event => { if (!event.target.value) return; selectedDay = event.target.value; shownMonth = new Date(selectedDay + "T12:00:00"); shownMonth.setDate(1); renderAgenda(); });
  $("#clearAppointmentForm").addEventListener("click", () => resetAppointmentForm());
  $("#cancelAppointmentEdit").addEventListener("click", () => resetAppointmentForm());
  appointmentForm.addEventListener("submit", async event => {
    event.preventDefault(); const id = $("#appointmentId").value;
    const selectedPro = $("#appointmentPsychologist").selectedOptions[0];
    const item = { id: id || window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, psychologist: selectedPro.textContent, professionalId:selectedPro.dataset.professionalId || "", date: $("#appointmentDate").value, time: $("#appointmentTime").value, duration: Number($("#appointmentDuration").value), mode: $("#appointmentMode").value, note: $("#appointmentNote").value.trim() };
    const collision = readAppointments().some(row => row.id !== id && row.psychologist === item.psychologist && row.date === item.date && row.time === item.time);
    if (collision) { if (window.toast) toast("Já existe um item para este profissional neste horário."); return; }
    try {
      if (id) await PsychoAPI.patch(`/api/appointments/${encodeURIComponent(id)}`, { date:item.date, time:item.time, duration:item.duration, professionalName:item.psychologist, modality:item.mode, note:item.note });
      else { const saved = await PsychoAPI.post("/api/appointments", { date:item.date, time:item.time, duration:item.duration, professionalName:item.psychologist, professionalId:item.professionalId, modality:item.mode, note:item.note }); item.id=saved.appointment.id; item.status=saved.appointment.status; }
      writeAppointments([...readAppointments().filter(row => row.id !== id), item]); selectedDay = item.date; shownMonth = new Date(item.date + "T12:00:00"); shownMonth.setDate(1);
      resetAppointmentForm(selectedDay); renderAgenda(); if (window.toast) toast(id ? "Lembrete atualizado no servidor." : "Lembrete salvo no servidor.");
    } catch(error) { if (window.toast) toast(`Não foi possível salvar: ${error.message}`); }
  });
  renderAgenda();

  window.addEventListener("psychohealth:languagechange", () => {
    renderMoods();
    renderSelfCare();
    renderGoals();
    renderAgenda();
    if (timer) showBreathingPhase();
  });

  /* Os dados adicionados pelas novas ferramentas podem ser apagados juntos. */
  document.addEventListener("click", event => {
    if (event.target.id !== "confirmDelete") return;
    localStorage.removeItem(moodKey);
    localStorage.removeItem(selfCareKey);
    localStorage.removeItem(goalsKey);
    localStorage.removeItem("psychoMoodHistory");
    localStorage.removeItem(appointmentsKey);
  });
})();
