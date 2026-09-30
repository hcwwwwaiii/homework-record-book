(function () {
  "use strict";

  const STORAGE_KEY = "homework-followup-v1";
  const CLOUD_URL = "https://omemhiwbmuzzfsrawlpg.supabase.co";
  const CLOUD_KEY = "sb_publishable_p_u_0rNMe1BgH5o_QQUUyg_6ksNm1xg";
  const CLOUD_TABLE = "homework_workspaces";
  const CLOUD_BUCKET = "homework-samples";
  const CLOUD_USER_KEY = STORAGE_KEY + "-cloud-user";
  const CLOUD_DIRTY_KEY = STORAGE_KEY + "-cloud-dirty";
  const CLOUD_BASE_KEY = STORAGE_KEY + "-cloud-base-";
  const CLOUD_PENDING_SAMPLES_KEY = STORAGE_KEY + "-pending-samples-";
  const DEFAULT_CLASSES = [
    { id: "math-a", name: "數學 A 班", subject: "數學" },
    { id: "math-b", name: "數學 B 班", subject: "數學" },
    { id: "physics", name: "物理班", subject: "物理" }
  ];
  const TOPICS = {
    "math-a": [
      ["1", "近似、量度與誤差"],
      ["2", "多項式的運算及因式分解"],
      ["3", "恆等式"],
      ["4", "代數分式與公式"],
      ["7", "數據的組織和表達（二）"],
      ["8", "率、比及比例"],
      ["5", "二元一次方程"],
      ["11", "畢氏定理及無理數"],
      ["12", "認識三角學"],
      ["10", "多邊形"],
      ["13", "求積法（二）"],
      ["9", "全等及相似（二）"],
      ["6", "角和平行線（二）"]
    ],
    "math-b": [
      ["4", "一元一次不等式"],
      ["2", "整數指數定律"],
      ["3", "百分法（二）"],
      ["1", "續因式分解"],
      ["5", "概率"],
      ["7", "續三角形"],
      ["8", "四邊形"],
      ["13", "直線坐標系（二）"],
      ["11", "三角學的關係"],
      ["12", "三角學的應用"],
      ["9", "續立體圖形"],
      ["10", "求積法（三）"],
      ["6", "集中趨勢的量度"],
      ["", "TSA 基礎鞏固課程"]
    ]
  };
  const HOMEWORK_NAMES = ["預習", "課堂練習", "鞏固練習", "TSA練習"];
  const $ = (selector) => document.querySelector(selector);
  const cloudModel = window.HomeworkCloudModel;
  let cloudClient = null;
  let cloudReady = false;
  let cloudBusy = false;
  let cloudPending = false;
  let cloudTimer = null;
  let cloudTimestamp = null;
  let cloudChannel = null;
  let cloudUserId = null;
  let cloudRevision = null;
  let cloudBaseline = null;
  let cloudConflict = false;
  let cloudUploadingSamples = false;
  const state = loadState();
  let activeClassId = DEFAULT_CLASSES[0].id;
  let activeView = "today";
  let objectUrls = [];
  let previewUrl = null;
  let renderSerial = 0;
  let toastTimer;
  let selectedBatchStatuses = new Map();
  let selectedTodayMissingIds = new Set();
  let selectedDailyStatuses = new Map();
  let selectedRecordsMonth = todayDate().slice(0, 7);
  let todayFilter = "unrecorded";
  let todaySearch = "";
  let displayedDate = "";

  function loadState() {
    let result;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && Array.isArray(stored.classes) && Array.isArray(stored.students) && Array.isArray(stored.assignments) && Array.isArray(stored.misses)) {
        result = {
          classes: DEFAULT_CLASSES.map((base) => ({ ...base, name: stored.classes.find((item) => item.id === base.id)?.name || base.name })),
          students: stored.students,
          assignments: stored.assignments,
          misses: stored.misses,
          absences: Array.isArray(stored.absences) ? stored.absences : [],
          dailyRecords: Array.isArray(stored.dailyRecords) ? stored.dailyRecords : [],
          dailyRecordVersion: stored.dailyRecordVersion || 0,
          excellentByMonth: Array.isArray(stored.excellentByMonth) ? stored.excellentByMonth : [],
          warningsHandled: Array.isArray(stored.warningsHandled) ? stored.warningsHandled : [],
          rosterSeedVersion: stored.rosterSeedVersion || 0
        };
      }
    } catch (error) {
      console.warn("Unable to read saved records", error);
    }
    if (!result) result = { classes: DEFAULT_CLASSES.map((item) => ({ ...item })), students: [], assignments: [], misses: [], absences: [], dailyRecords: [], dailyRecordVersion: 1, excellentByMonth: [], warningsHandled: [], rosterSeedVersion: 0 };
    if (result.dailyRecordVersion < 1) {
      for (const miss of result.misses) {
        const firstDate = localDateFromTimestamp(miss.createdAt);
        result.dailyRecords.push({ id: "legacy-miss-" + miss.id, classId: miss.classId, assignmentId: miss.assignmentId, studentId: miss.studentId, date: firstDate, status: "missing", recordedAt: miss.createdAt || new Date().toISOString(), legacy: true });
        if (miss.submittedAt) result.dailyRecords.push({ id: "legacy-submitted-" + miss.id, classId: miss.classId, assignmentId: miss.assignmentId, studentId: miss.studentId, date: localDateFromTimestamp(miss.submittedAt), status: "submitted", recordedAt: miss.submittedAt, legacy: true });
      }
      for (const absence of result.absences) {
        const firstDate = localDateFromTimestamp(absence.createdAt);
        result.dailyRecords.push({ id: "legacy-absent-" + absence.id, classId: absence.classId, assignmentId: absence.assignmentId, studentId: absence.studentId, date: firstDate, status: "absent", recordedAt: absence.createdAt || new Date().toISOString(), legacy: true });
        if (absence.submittedAt) result.dailyRecords.push({ id: "legacy-absent-submitted-" + absence.id, classId: absence.classId, assignmentId: absence.assignmentId, studentId: absence.studentId, date: localDateFromTimestamp(absence.submittedAt), status: "submitted", recordedAt: absence.submittedAt, legacy: true });
      }
      result.assignments.forEach((assignment) => {
        if (assignment.firstRecordedOn) return;
        const dates = result.dailyRecords.filter((item) => item.assignmentId === assignment.id).map((item) => item.date).sort();
        if (dates.length) assignment.firstRecordedOn = dates[0];
      });
      result.dailyRecordVersion = 1;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); }
      catch (error) { console.warn("Unable to save migrated daily records", error); }
    }
    if (result.rosterSeedVersion < 1 && window.ROSTER_SEED) {
      for (const base of DEFAULT_CLASSES) {
        const roster = window.ROSTER_SEED[base.id];
        if (!roster) continue;
        const classRecord = result.classes.find((item) => item.id === base.id);
        if (classRecord.name === base.name) classRecord.name = roster.name;
        roster.students.forEach((student, index) => {
          const existing = result.students.find((item) => item.classId === base.id && item.name === student.name);
          if (existing) Object.assign(existing, { form: student.form || "", number: student.number || "", order: index });
          else result.students.push({ id: `roster-${base.id}-${index + 1}`, classId: base.id, name: student.name, form: student.form || "", number: student.number || "", order: index });
        });
      }
      result.rosterSeedVersion = 1;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); }
      catch (error) { console.warn("Unable to save imported roster", error); }
    }
    return result;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (cloudReady) {
        localStorage.setItem(CLOUD_DIRTY_KEY, "1");
        queueCloudSave();
      }
      return true;
    } catch (error) {
      console.error("Unable to save records", error);
      toast("無法儲存紀錄，請檢查瀏覽器儲存空間。", true);
      return false;
    }
  }

  function setCloudStatus(message) {
    const status = $("#syncStatus");
    const settings = $("#cloudSyncStatus");
    if (status) status.textContent = message;
    if (settings) settings.textContent = message;
  }

  function validCloudState(data) {
    return data && Array.isArray(data.classes) && Array.isArray(data.students) &&
      Array.isArray(data.assignments) && Array.isArray(data.misses);
  }

  function applyCloudState(data) {
    if (!validCloudState(data)) throw new Error("雲端資料格式不正確。");
    for (const assignment of data.assignments) {
      const previous = state.assignments.find((item) => item.id === assignment.id);
      if (previous && previous.sampleUpdatedAt !== assignment.sampleUpdatedAt &&
          !pendingSampleIds().includes(assignment.id)) {
        sampleOperation("readwrite", assignment.id).catch((error) => console.warn("Unable to refresh sample cache", error));
      }
    }
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function rememberCloudBase(data, revision, updatedAt) {
    cloudBaseline = cloudModel.clone(data);
    cloudRevision = Number(revision);
    cloudTimestamp = updatedAt;
    try {
      localStorage.setItem(CLOUD_BASE_KEY + cloudUserId, JSON.stringify({ revision: cloudRevision, data: cloudBaseline }));
    } catch (error) {
      console.warn("Unable to store cloud comparison copy", error);
    }
  }

  function showConflictActions() {
    const actions = $("#cloudConflictActions");
    if (actions) actions.hidden = !cloudConflict;
  }

  async function readCloudState() {
    const { data, error } = await cloudClient.rpc("homework_load");
    if (error) throw error;
    if (!data || !validCloudState(data.state) || !Number.isSafeInteger(Number(data.revision))) {
      throw new Error("雲端資料格式不正確。");
    }
    return { state: data.state, revision: Number(data.revision), updatedAt: data.updatedAt };
  }

  function pendingSampleIds() {
    try {
      const saved = JSON.parse(localStorage.getItem(CLOUD_PENDING_SAMPLES_KEY + cloudUserId));
      return Array.isArray(saved) ? saved : [];
    } catch { return []; }
  }

  function markSamplePending(id) {
    if (!cloudUserId) return;
    const ids = new Set(pendingSampleIds());
    ids.add(id);
    localStorage.setItem(CLOUD_PENDING_SAMPLES_KEY + cloudUserId, JSON.stringify([...ids]));
  }

  async function uploadPendingSamples() {
    if (!cloudReady || cloudUploadingSamples || !cloudClient) return;
    cloudUploadingSamples = true;
    try {
      for (const id of pendingSampleIds()) {
        if (!state.assignments.some((item) => item.id === id)) continue;
        const file = await sampleOperation("readonly", id);
        if (!file) continue;
        const { error } = await cloudClient.storage.from(CLOUD_BUCKET)
          .upload(id, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        localStorage.setItem(CLOUD_PENDING_SAMPLES_KEY + cloudUserId,
          JSON.stringify(pendingSampleIds().filter((item) => item !== id)));
      }
    } catch (error) {
      console.error("Sample upload failed", error);
      setCloudStatus("功課資料已同步；樣本檔案待網絡恢復後重試。");
    } finally {
      cloudUploadingSamples = false;
    }
  }

  function queueCloudSave() {
    if (!cloudReady || !cloudClient || cloudConflict) return;
    cloudPending = true;
    setCloudStatus("有待同步的變更…");
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(syncCloudNow, 700);
  }

  async function syncCloudNow() {
    if (!cloudReady || !cloudClient || cloudConflict) return false;
    if (cloudBusy) { cloudPending = true; return false; }
    cloudBusy = true;
    cloudPending = false;
    let failed = false;
    try {
      const payload = JSON.parse(JSON.stringify(state));
      const patch = cloudModel.diff(cloudBaseline, payload);
      if (patch) {
        const { data: saved, error } = await cloudClient.rpc("homework_apply_patch", {
          p_expected_revision: cloudRevision, p_patch: patch
        });
        if (error?.message?.includes("revision_conflict")) {
          const remote = await readCloudState();
          const clashes = cloudModel.conflicts(cloudBaseline, remote.state, patch);
          if (clashes.length) {
            cloudConflict = true;
            showConflictActions();
            setCloudStatus("其他裝置亦修改了相同紀錄；請在「班別與資料」選擇保留版本。");
            return false;
          }
          applyCloudState(cloudModel.apply(remote.state, patch));
          rememberCloudBase(remote.state, remote.revision, remote.updatedAt);
          cloudPending = true;
          render();
          return false;
        }
        if (error) throw error;
        rememberCloudBase(payload, saved.revision, saved.updatedAt);
      }
      if (cloudModel.diff(cloudBaseline, state)) {
        localStorage.setItem(CLOUD_DIRTY_KEY, "1");
        cloudPending = true;
      } else {
        localStorage.removeItem(CLOUD_DIRTY_KEY);
      }
      setCloudStatus("已同步 · " + new Date(cloudTimestamp || Date.now()).toLocaleString("zh-HK", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
      await uploadPendingSamples();
      return true;
    } catch (error) {
      console.error("Cloud sync failed", error);
      failed = true;
      cloudPending = true;
      localStorage.setItem(CLOUD_DIRTY_KEY, "1");
      setCloudStatus("同步暫時失敗；紀錄仍保存在本機，恢復連線後會重試。");
      return false;
    } finally {
      cloudBusy = false;
      if (!failed && cloudPending && cloudReady && !cloudConflict && navigator.onLine) queueCloudSave();
    }
  }

  async function refreshFromCloud() {
    if (!cloudReady || cloudBusy || cloudConflict) return;
    if (localStorage.getItem(CLOUD_DIRTY_KEY) === "1") return queueCloudSave();
    try {
      const remote = await readCloudState();
      if (remote.revision <= cloudRevision) return;
      if (localStorage.getItem(CLOUD_DIRTY_KEY) === "1") return queueCloudSave();
      applyCloudState(remote.state);
      rememberCloudBase(remote.state, remote.revision, remote.updatedAt);
      render();
      setCloudStatus("已接收其他裝置的更新。");
    } catch (error) {
      console.error("Unable to refresh cloud records", error);
      setCloudStatus("未能讀取其他裝置的更新；請稍後重試。");
    }
  }

  async function resolveCloudConflict(useLocal) {
    if (!cloudConflict || !cloudReady) return;
    try {
      const remote = await readCloudState();
      const patch = cloudModel.diff(cloudBaseline, state);
      if (useLocal && patch) {
        applyCloudState(cloudModel.apply(remote.state, patch));
        localStorage.setItem(CLOUD_DIRTY_KEY, "1");
      } else {
        applyCloudState(remote.state);
        localStorage.removeItem(CLOUD_DIRTY_KEY);
      }
      rememberCloudBase(remote.state, remote.revision, remote.updatedAt);
      cloudConflict = false;
      showConflictActions();
      render();
      if (useLocal && patch) queueCloudSave();
      else setCloudStatus("已載入最新雲端紀錄。");
    } catch (error) {
      console.error("Unable to resolve cloud conflict", error);
      setCloudStatus("未能取得最新雲端紀錄，請稍後重試。");
    }
  }

  async function startCloudSession(session) {
    if (!session?.user?.id) throw new Error("未能確認登入帳戶。");
    $("#cloudAccount").textContent = "目前登入：" + (session.user.email || "帳戶 " + session.user.id.slice(0, 8));
    if (cloudReady && cloudUserId === session.user.id) return;
    cloudReady = false;
    cloudUserId = session.user.id;
    setCloudStatus("正在載入雲端紀錄…");
    const remote = await readCloudState();
    const hasLocalChanges = localStorage.getItem(CLOUD_DIRTY_KEY) === "1";
    const hasSyncedHere = localStorage.getItem(CLOUD_USER_KEY) === session.user.id;
    if (hasLocalChanges && hasSyncedHere) {
      let oldBase;
      try { oldBase = JSON.parse(localStorage.getItem(CLOUD_BASE_KEY + cloudUserId)); }
      catch { oldBase = null; }
      if (oldBase && validCloudState(oldBase.data)) {
        const patch = cloudModel.diff(oldBase.data, state);
        const clashes = patch ? cloudModel.conflicts(oldBase.data, remote.state, patch) : [];
        if (clashes.length) {
          cloudBaseline = oldBase.data;
          cloudRevision = Number(oldBase.revision);
          cloudConflict = true;
        } else {
          applyCloudState(patch ? cloudModel.apply(remote.state, patch) : remote.state);
          rememberCloudBase(remote.state, remote.revision, remote.updatedAt);
          if (!patch) localStorage.removeItem(CLOUD_DIRTY_KEY);
        }
      } else {
        if (cloudModel.diff(remote.state, state)) {
          cloudBaseline = remote.state;
          cloudRevision = remote.revision;
          cloudConflict = true;
        } else {
          applyCloudState(remote.state);
          rememberCloudBase(remote.state, remote.revision, remote.updatedAt);
          localStorage.removeItem(CLOUD_DIRTY_KEY);
        }
      }
    } else {
      applyCloudState(remote.state);
      rememberCloudBase(remote.state, remote.revision, remote.updatedAt);
      localStorage.removeItem(CLOUD_DIRTY_KEY);
    }
    cloudReady = true;
    localStorage.setItem(CLOUD_USER_KEY, session.user.id);
    $("#cloudGate").hidden = true;
    $("#appShell").hidden = false;
    $("#cloudSignOutButton").hidden = false;
    showConflictActions();
    if (cloudChannel) cloudClient.removeChannel(cloudChannel);
    cloudChannel = cloudClient.channel("homework-workspace-" + cloudUserId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: CLOUD_TABLE, filter: "owner_id=eq." + cloudUserId }, (change) => {
        if (change.new?.revision > cloudRevision) refreshFromCloud();
      })
      .subscribe();
    render();
    if (cloudConflict) {
      setCloudStatus("此裝置有未同步變更；請在「班別與資料」選擇保留版本。");
    } else if (cloudModel.diff(cloudBaseline, state)) {
      queueCloudSave();
    } else {
      setCloudStatus("已同步 · " + new Date(cloudTimestamp || Date.now()).toLocaleString("zh-HK", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
      await uploadPendingSamples();
    }
  }

  function showCloudGate(message) {
    $("#appShell").hidden = true;
    $("#cloudGate").hidden = false;
    $("#cloudLoginMessage").textContent = message || "";
    $("#cloudSignOutButton").hidden = true;
    $("#cloudAccount").textContent = "尚未登入雲端帳戶";
  }

  async function initializeCloud() {
    if (location.protocol === "file:") {
      $("#appShell").hidden = false;
      setCloudStatus("本機版 · 紀錄只儲存在此瀏覽器");
      $("#cloudAccount").textContent = "本機版 · 未連接雲端帳戶";
      render();
      return;
    }
    if (!window.supabase?.createClient || !cloudModel) {
      $("#cloudLoginButton").disabled = true;
      showCloudGate("雲端同步程式未能載入。請檢查網絡連線後重新整理。");
      return;
    }
    cloudClient = window.supabase.createClient(CLOUD_URL, CLOUD_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    cloudClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        cloudReady = false;
        cloudUserId = null;
        cloudRevision = null;
        cloudBaseline = null;
        cloudConflict = false;
        showCloudGate("已登出。請使用教師帳戶登入以查看雲端紀錄。");
      }
    });
    const { data, error } = await cloudClient.auth.getSession();
    if (error) { showCloudGate("登入狀態讀取失敗，請重新整理。"); return; }
    if (!data.session) {
      showCloudGate("請使用已建立的教師帳戶登入。");
      return;
    }
    try { await startCloudSession(data.session); }
    catch (error) {
      console.error("Unable to start cloud sync", error);
      showCloudGate("雲端紀錄未能讀取。請檢查登入帳戶及資料庫設定後重新整理。");
    }
  }

  function openSampleDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
      const request = indexedDB.open("homework-followup-samples", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("samples");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function sampleOperation(mode, id, value) {
    const db = await openSampleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("samples", mode);
      const store = tx.objectStore("samples");
      const request = mode === "readonly" ? store.get(id) : value === undefined ? store.delete(id) : store.put(value, id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function getSample(id) {
    const local = await sampleOperation("readonly", id);
    if (local || !cloudReady) return local;
    const { data, error } = await cloudClient.storage.from(CLOUD_BUCKET).download(id);
    if (error) throw error;
    await sampleOperation("readwrite", id, data);
    return data;
  }
  async function putSample(id, file) {
    await sampleOperation("readwrite", id, file);
    if (cloudReady) markSamplePending(id);
  }
  async function deleteSample(id) {
    if (cloudReady) {
      const { error } = await cloudClient.storage.from(CLOUD_BUCKET).remove([id]);
      if (error) throw error;
      localStorage.setItem(CLOUD_PENDING_SAMPLES_KEY + cloudUserId,
        JSON.stringify(pendingSampleIds().filter((item) => item !== id)));
    }
    await sampleOperation("readwrite", id);
  }
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const activeClass = () => state.classes.find((item) => item.id === activeClassId);
  const classStudents = () => state.students.filter((item) => item.classId === activeClassId);
  const classAssignments = () => state.assignments.filter((item) => item.classId === activeClassId);
  const isManagedStudent = (assignment, student) => student.classId === assignment.classId && !(assignment.excludedStudentIds || []).includes(student.id);
  const assignmentStudents = (assignment) => state.students.filter((student) => isManagedStudent(assignment, student));
  const classMisses = () => state.dailyRecords.filter((item) => item.classId === activeClassId && item.status === "missing");
  const studentMisses = (id) => state.dailyRecords.filter((item) => item.studentId === id && item.status === "missing");
  const assignmentMisses = (id) => state.dailyRecords.filter((item) => item.assignmentId === id && item.status === "missing");
  const assignmentEntries = (id) => state.dailyRecords.filter((item) => item.assignmentId === id);
  const firstDayEntry = (assignment, studentId) => state.dailyRecords.find((item) => item.assignmentId === assignment.id && item.studentId === studentId && item.date === assignment.firstRecordedOn);
  function warningProgress(studentId) {
    const earned = Math.floor(studentMisses(studentId).length / 5);
    const handled = (state.warningsHandled || []).filter((item) => item.studentId === studentId && item.warningNumber <= earned && !item.revokedAt);
    const handledNumbers = new Set(handled.map((item) => item.warningNumber));
    return { earned, handled, pending: Math.max(0, earned - handledNumbers.size), next: Array.from({ length: earned }, (_, index) => index + 1).find((number) => !handledNumbers.has(number)) };
  }
  function latestEntry(assignmentId, studentId, untilDate) {
    return assignmentEntries(assignmentId).filter((item) => item.studentId === studentId && (!untilDate || item.date <= untilDate)).sort((a, b) => a.date.localeCompare(b.date) || (a.recordedAt || "").localeCompare(b.recordedAt || "") || a.id.localeCompare(b.id)).at(-1);
  }
  function isOutstanding(assignment, student) {
    if (assignment.archivedAt || !isManagedStudent(assignment, student)) return false;
    const status = latestEntry(assignment.id, student.id)?.status;
    return status === "missing" || status === "absent";
  }
  function statusCounts(assignment) {
    const counts = { missing: 0, submitted: 0, absent: 0, unrecorded: 0 };
    assignmentStudents(assignment).forEach((student) => {
      const status = latestEntry(assignment.id, student.id)?.status || "unrecorded";
      counts[status]++;
    });
    return counts;
  }
  function upsertDailyRecord(assignment, studentId, date, status) {
    state.dailyRecords = state.dailyRecords.filter((item) => item.assignmentId !== assignment.id || item.studentId !== studentId || item.date !== date);
    if (status !== "clear") state.dailyRecords.push({ id: uid(), classId: assignment.classId, assignmentId: assignment.id, studentId, date, status, recordedAt: new Date().toISOString() });
  }
  const sortedStudents = () => classStudents().sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.name.localeCompare(b.name, "zh-Hant"));
  const studentDetail = (student) => student.form ? `${student.form} · ${student.number || "—"} 號` : "";

  function topicLabel(assignment) {
    if (!assignment.topic) return "未分類";
    return assignment.chapter ? "第 " + assignment.chapter + " 章 · " + assignment.topic : assignment.topic;
  }

  function topicRank(assignment) {
    if (!assignment.topic) return 9999;
    const list = TOPICS[assignment.classId] || [];
    const index = list.findIndex((entry) => entry[0] === String(assignment.chapter || "") && entry[1] === assignment.topic);
    return index < 0 ? 5000 : index;
  }

  function compareByTopic(a, b, dateField) {
    return topicRank(a) - topicRank(b) || topicLabel(a).localeCompare(topicLabel(b), "zh-Hant") || b[dateField].localeCompare(a[dateField]);
  }

  function groupCards(container, assignments, selector) {
    const cards = [...container.querySelectorAll(selector)];
    const fragment = document.createDocumentFragment();
    let currentLabel = null;
    let groupBody = null;
    assignments.forEach((assignment, index) => {
      const label = topicLabel(assignment);
      if (label !== currentLabel) {
        currentLabel = label;
        const group = document.createElement("section");
        group.className = "topic-group";
        const heading = document.createElement("div");
        heading.className = "topic-group-heading";
        const title = document.createElement("h3");
        title.textContent = label;
        const count = document.createElement("span");
        count.textContent = assignments.filter((item) => topicLabel(item) === label).length + " 份";
        heading.append(title, count);
        groupBody = document.createElement("div");
        groupBody.className = "topic-cards";
        group.append(heading, groupBody);
        fragment.append(group);
      }
      groupBody.append(cards[index]);
    });
    container.replaceChildren(fragment);
  }

  function formatDate(value) {
    if (!value) return "未設定日期";
    const parts = value.split("-");
    return `${Number(parts[1])} 月 ${Number(parts[2])} 日`;
  }

  function localDateFromTimestamp(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return todayDate();
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function todayDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function toast(message, error = false) {
    const element = $("#toast");
    element.textContent = message;
    element.style.background = error ? "#9b4d3d" : "#183b3b";
    element.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("show"), 3200);
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function showDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog.open) dialog.showModal();
  }

  function renderTabs() {
    $("#classTabs").innerHTML = state.classes.map((item) => {
      const assignments = state.assignments.filter((assignment) => assignment.classId === item.id && !assignment.archivedAt);
      const outstanding = assignments.reduce((sum, assignment) => sum + assignmentStudents(assignment).filter((student) => isOutstanding(assignment, student)).length, 0);
      return '<button class="class-tab ' + (item.id === activeClassId ? "active" : "") + ' ' + (item.subject === "物理" ? "physics" : "") + '" type="button" data-class="' + item.id + '" aria-current="' + (item.id === activeClassId ? "page" : "false") + '"><span class="class-dot"></span>' + esc(item.name) + '<span class="tab-count" aria-label="' + outstanding + ' 份待交">' + outstanding + '</span></button>';
    }).join("");
  }

  function renderOverview() {
    $("#subjectLabel").textContent = activeClass().subject;
    $("#overviewTitle").textContent = activeClass().name;
    $("#outstandingCount").textContent = classAssignments().filter((item) => !item.archivedAt).reduce((sum, assignment) => sum + assignmentStudents(assignment).filter((student) => isOutstanding(assignment, student)).length, 0);
    $("#missCount").textContent = classMisses().length;
    $("#warningCount").textContent = classStudents().reduce((sum, student) => sum + warningProgress(student.id).pending, 0);
  }

  function renderToday() {
    const date = todayDate();
    const query = todaySearch.trim().toLocaleLowerCase("zh-Hant");
    const matches = (assignment, student, classItem) => !query || [
      classItem.name, assignment.title, topicLabel(assignment), assignment.detailTopic || "",
      student?.name || "", student?.form || "", student?.number || ""
    ].some((value) => String(value).toLocaleLowerCase("zh-Hant").includes(query));
    const groups = state.classes.map((classItem) => {
      const assignments = state.assignments.filter((assignment) => assignment.classId === classItem.id && !assignment.archivedAt);
      const pending = assignments.map((assignment) => ({
        assignment,
        students: assignmentStudents(assignment).filter((student) => isOutstanding(assignment, student))
      })).filter((item) => item.students.length);
      const toRecord = pending.reduce((sum, item) => sum + item.students.filter((student) => latestEntry(item.assignment.id, student.id)?.date !== date).length, 0);
      const visible = pending.map(({ assignment, students }) => ({
        assignment,
        students: students.filter((student) => (todayFilter === "all" || latestEntry(assignment.id, student.id)?.date !== date) && matches(assignment, student, classItem))
      })).filter((item) => item.students.length);
      const unrecorded = assignments.filter((assignment) => !assignment.firstRecordedOn && matches(assignment, null, classItem));
      return { classItem, visible, unrecorded, count: pending.reduce((sum, item) => sum + item.students.length, 0), toRecord };
    });
    const total = groups.reduce((sum, item) => sum + item.count, 0);
    const toRecordTotal = groups.reduce((sum, item) => sum + item.toRecord, 0);
    $("#todayPendingCount").textContent = total + " 份待交";
    $("#todayToRecordCount").textContent = toRecordTotal + " 筆";
    $("#todaySearch").value = todaySearch;
    document.querySelectorAll("[data-today-filter]").forEach((button) => {
      const active = button.dataset.todayFilter === todayFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#todayContent").innerHTML = groups.map(({ classItem, visible, unrecorded, count, toRecord }) => {
      const unrecordedList = unrecorded.length ? '<div class="today-unrecorded"><strong>' + unrecorded.length + ' 份功課尚未記錄首次收交</strong>' + unrecorded.map((assignment) => '<button class="small-button" type="button" data-action="add-missing" data-id="' + esc(assignment.id) + '">' + esc(assignment.title) + ' · 開始記錄</button>').join("") + '</div>' : "";
      const cards = visible.map(({ assignment, students }) => {
        const rows = students.map((student) => {
          const latest = latestEntry(assignment.id, student.id);
          const todayRecord = latest?.date === date ? latest.status : "";
          const assignmentCount = assignmentMisses(assignment.id).filter((item) => item.studentId === student.id).length;
          const status = todayRecord === "missing" ? "今日已記欠交" : todayRecord === "absent" ? "今日已記缺席" : latest?.status === "absent" ? "上次缺席" : "仍待補交";
          return '<div class="today-row"><div class="today-person"><strong>' + esc(student.name) + '</strong><small>' + esc(studentDetail(student)) + '</small></div><div class="today-row-meta"><span class="tracking-status ' + (latest?.status === "absent" ? "absent" : "pending") + '">' + status + '</span><small>本份累計欠交 ' + assignmentCount + ' 次 · 上次記錄 ' + esc(latest?.date || "—") + '</small></div><div class="today-actions" role="group" aria-label="' + esc(student.name) + ' ' + esc(assignment.title) + ' 今日狀態"><button class="small-button" type="button" data-action="today-status" data-status="submitted" data-id="' + esc(assignment.id) + '" data-student-id="' + esc(student.id) + '">已補交</button><button class="small-button" type="button" data-action="today-status" data-status="absent" data-id="' + esc(assignment.id) + '" data-student-id="' + esc(student.id) + '" ' + (todayRecord === "absent" ? "disabled" : "") + '>缺席</button><button class="small-button today-missing-button" type="button" data-action="today-status" data-status="missing" data-id="' + esc(assignment.id) + '" data-student-id="' + esc(student.id) + '" ' + (todayRecord === "missing" ? "disabled" : "") + '>仍欠交</button></div></div>';
        }).join("");
        const detail = assignment.detailTopic ? '<p class="today-assignment-detail">' + esc(assignment.detailTopic) + '</p>' : "";
        return '<article class="today-card"><div class="today-card-heading"><div><p class="assignment-meta">' + esc(topicLabel(assignment)) + ' · 繳交日期 ' + esc(formatDate(assignment.due)) + '</p><h4>' + esc(assignment.title) + '</h4>' + detail + '</div><span class="status-pill">' + students.length + ' 份待交</span></div>' + rows + '</article>';
      }).join("");
      const empty = query ? "沒有符合搜尋的待交功課。" : todayFilter === "unrecorded" ? (count ? "今天已記錄的學生可在「全部待交」查看或修正。" : "目前沒有待交功課。") : "目前沒有待交功課。";
      const visibleCount = visible.reduce((sum, item) => sum + item.students.length, 0);
      const headingCount = query ? visibleCount + " 位符合搜尋" : todayFilter === "unrecorded" ? toRecord + " 筆未記今天" : count + " 份待交";
      return '<section class="today-class" aria-label="' + esc(classItem.name) + '"><div class="today-class-heading"><h3>' + esc(classItem.name) + '</h3><span>' + headingCount + '</span></div>' + unrecordedList + (cards || (!unrecordedList ? '<p class="record-empty">' + empty + '</p>' : "")) + '</section>';
    }).join("");
  }

  function recordTodayStatus(assignmentId, studentId, status) {
    if (!["submitted", "absent", "missing"].includes(status)) return;
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    const student = state.students.find((item) => item.id === studentId);
    const date = todayDate();
    if (!assignment || !student || assignment.archivedAt || !assignment.firstRecordedOn || assignment.firstRecordedOn > date || !isOutstanding(assignment, student)) return toast("此學生目前沒有這份待交功課，請重新整理。", true);
    const before = warningProgress(studentId).earned;
    const previousRecords = state.dailyRecords;
    upsertDailyRecord(assignment, studentId, date, status);
    if (!saveState()) { state.dailyRecords = previousRecords; return; }
    render();
    const label = { submitted: "已補交", absent: "今日缺席", missing: "今日仍欠交" }[status];
    toast(student.name + ' · ' + assignment.title + '：' + label + (warningProgress(studentId).earned > before ? '；達到新警示。' : '。'));
  }

  function releaseCardUrls() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
  }

  async function renderAssignments() {
    const serial = ++renderSerial;
    releaseCardUrls();
    const assignments = classAssignments().filter((item) => !item.archivedAt).sort((a, b) => compareByTopic(a, b, "due") || b.createdAt.localeCompare(a.createdAt));
    const container = $("#assignmentsList");
    if (!assignments.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-illustration" aria-hidden="true">▤</div><h3>目前沒有現行功課</h3><p>新增功課後可記錄全班收交情況；已封存的功課可在「已封存」查看。</p><button class="primary-button" type="button" data-action="add-assignment">＋ 新增功課</button></div>';
      return;
    }
    container.innerHTML = assignments.map((assignment) => {
      const counts = statusCounts(assignment);
      const misses = assignmentMisses(assignment.id);
      const statuses = sortedStudents().filter((student) => isManagedStudent(assignment, student)).map((student) => ({ student, status: latestEntry(assignment.id, student.id)?.status || "unrecorded" }));
      const pending = statuses.filter((item) => item.status === "missing");
      const absent = statuses.filter((item) => item.status === "absent");
      const submitted = statuses.filter((item) => item.status === "submitted");
      const pendingList = pending.length ? pending.map((item) => '<span class="missing-chip">' + esc(item.student.name) + '</span>').join("") : '<p class="all-clear">' + (!assignmentStudents(assignment).length ? "這份功課沒有需要管理的學生" : assignment.firstRecordedOn ? "目前沒有未交學生" : "尚未記錄首次收交") + '</p>';
      const absentList = absent.length ? '<div class="absent-list"><span>缺席待交：</span>' + absent.map((item) => '<span class="absent-chip">' + esc(item.student.name) + '</span>').join("") + '</div>' : "";
      const submittedList = submitted.length ? '<details class="submission-details"><summary>已交 ' + submitted.length + ' 位學生</summary><div class="submitted-list">' + submitted.map((item) => '<span class="submitted-chip">' + esc(item.student.name) + '</span>').join("") + '</div></details>' : "";
      const thumb = assignment.sampleType?.startsWith("image/") ? '<img data-sample-image="' + assignment.id + '" alt="' + esc(assignment.title) + ' 樣本預覽">' : assignment.sampleType === "application/pdf" ? '<iframe data-sample-pdf="' + assignment.id + '" title="' + esc(assignment.title) + ' PDF 第一頁預覽" tabindex="-1"></iframe>' : '<span><span class="file-icon" aria-hidden="true">▤</span><br><span class="file-label">未加入樣本</span></span>';
      const summary = !assignmentStudents(assignment).length ? "毋須管理" : assignment.firstRecordedOn ? (counts.missing + counts.absent ? (counts.missing + counts.absent) + " 份待交" : "全班已交") : "尚未記錄首次收交";
      const action = !assignmentStudents(assignment).length ? '<span class="no-management">這份功課沒有需要管理的學生</span>' : assignment.firstRecordedOn ? '<button class="small-button tracking-open-button" type="button" data-action="open-tracking" data-id="' + assignment.id + '">每日更新收交</button>' : '<button class="small-button tracking-open-button" type="button" data-action="add-missing" data-id="' + assignment.id + '">第一次記錄欠交</button>';
      const editFirstAction = assignment.firstRecordedOn ? '<button class="small-button" type="button" data-action="edit-first-record" data-id="' + esc(assignment.id) + '">修改首次收交</button>' : "";
      const detailTopic = assignment.detailTopic ? '<p class="assignment-detail-topic"><strong>詳細課題／備註：</strong>' + esc(assignment.detailTopic) + '</p>' : "";
      const archiveButton = assignment.due < todayDate() ? '<button class="small-button archive-button" type="button" data-action="archive-assignment" data-id="' + assignment.id + '" aria-label="封存 ' + esc(assignment.title) + '">封存</button>' : "";
      return '<article class="assignment-card"><button class="sample-thumb ' + (assignment.sampleType ? "has-file" : "") + '" type="button" data-action="' + (assignment.sampleType ? "preview" : "edit-assignment") + '" data-id="' + assignment.id + '" aria-label="' + (assignment.sampleType ? "查看" : "加入") + ' ' + esc(assignment.title) + ' 的功課樣本">' + thumb + '</button><div class="assignment-body"><div class="assignment-top"><div><p class="assignment-meta">繳交日期 · ' + formatDate(assignment.due) + (assignment.due < todayDate() ? " · 已過期" : "") + '</p><h3>' + esc(assignment.title) + '</h3>' + detailTopic + '</div><div class="assignment-actions"><button class="icon-button" type="button" data-action="edit-assignment" data-id="' + assignment.id + '" aria-label="編輯 ' + esc(assignment.title) + '">✎</button><button class="icon-button" type="button" data-action="delete-assignment" data-id="' + assignment.id + '" aria-label="刪除 ' + esc(assignment.title) + '">×</button></div></div><div class="assignment-status"><span class="status-pill ' + (counts.missing + counts.absent ? "" : "clear") + '">' + summary + '</span><span class="muted">累計 ' + misses.length + ' 次欠交 · 已交 ' + counts.submitted + ' 位 · 缺席 ' + counts.absent + ' 位</span></div><div class="missing-list">' + pendingList + '</div>' + absentList + submittedList + '<div class="assignment-footer">' + action + editFirstAction + archiveButton + '</div></div></article>';
    }).join("");
    groupCards(container, assignments, ".assignment-card");
    await Promise.all(assignments.filter((item) => item.sampleType).map(async (assignment) => {
      try {
        const file = await getSample(assignment.id);
        if (!file || serial !== renderSerial) return;
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        const node = container.querySelector('[data-sample-image="' + assignment.id + '"], [data-sample-pdf="' + assignment.id + '"]');
        if (node) node.src = assignment.sampleType === "application/pdf" ? url + "#page=1&toolbar=0&navpanes=0&view=FitH" : url;
      } catch (error) { console.warn("Sample preview unavailable", error); }
    }));
  }

  function renderArchive() {
    const assignments = classAssignments().filter((item) => item.archivedAt).sort((a, b) => compareByTopic(a, b, "archivedAt"));
    const container = $("#archiveList");
    if (!assignments.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-illustration" aria-hidden="true">▣</div><h3>暫時沒有已封存功課</h3><p>繳交日期過後，可在功課紀錄按「封存」保存當時名單。</p></div>`;
      return;
    }
    container.innerHTML = assignments.map((assignment) => {
      const snapshot = assignment.archiveSnapshot || [];
      const pending = snapshot.filter((item) => item.status === "missing").length;
      const submitted = snapshot.filter((item) => item.status === "submitted").length;
      const absent = snapshot.filter((item) => item.status === "absent").length;
      const absentSubmitted = snapshot.filter((item) => item.status === "absent-submitted").length;
      const unrecorded = snapshot.filter((item) => item.status === "unrecorded").length;
      const archivedDate = new Date(assignment.archivedAt).toLocaleDateString("zh-HK");
      const detailTopic = assignment.detailTopic ? `<p class="assignment-detail-topic"><strong>詳細課題／備註：</strong>${esc(assignment.detailTopic)}</p>` : "";
      return `<article class="archive-card"><div><p class="assignment-meta">繳交日期 · ${formatDate(assignment.due)}　封存日期 · ${archivedDate}</p><h3>${esc(assignment.title)}</h3>${detailTopic}<div class="archive-counts"><span>${pending} 位未交</span><span>${submitted} 位已交</span><span>${absent} 位缺席待交</span><span>${absentSubmitted} 位缺席後已交</span><span>${unrecorded} 位未記錄</span></div></div><div class="archive-actions">${assignment.sampleType ? `<button class="small-button" type="button" data-action="preview" data-id="${assignment.id}">查看樣本</button>` : ""}<button class="small-button tracking-open-button" type="button" data-action="open-tracking" data-id="${assignment.id}">查看封存名單</button><button class="small-button" type="button" data-action="restore-assignment" data-id="${assignment.id}">取消封存</button></div></article>`;
    }).join("");
    groupCards(container, assignments, ".archive-card");
  }

  function renderStudents() {
    const students = sortedStudents();
    const container = $("#studentsContent");
    if (!students.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-illustration" aria-hidden="true">◫</div><h3>這個班別尚未有學生</h3><p>你可以稍後貼上名單；每行一位學生即可一次加入。</p><button class="primary-button" type="button" data-action="add-student">＋ 加入學生</button></div>';
      return;
    }
    const absentCount = students.filter((student) => student.longAbsent).length;
    container.innerHTML = '<div class="roster"><div class="roster-summary">共 ' + students.length + ' 位學生 · ' + absentCount + ' 位長缺 · 每 5 次未交記錄計 1 次警示</div><table class="roster-table"><thead><tr><th scope="col">學生</th><th scope="col">待交</th><th scope="col">累計欠交</th><th scope="col">警示</th><th scope="col">課業管理</th><th scope="col"></th></tr></thead><tbody>' + students.map((student) => {
      const misses = studentMisses(student.id);
      const pending = classAssignments().filter((assignment) => !assignment.archivedAt && isOutstanding(assignment, student)).length;
      const warning = warningProgress(student.id);
      const toward = misses.length % 5;
      return '<tr><td class="student-name">' + esc(student.name) + (student.longAbsent ? ' <span class="long-absent-badge">長缺</span>' : "") + '</td><td><span class="count">' + pending + '</span></td><td><span class="count">' + misses.length + '</span><div class="progress-track" role="progressbar" aria-label="距離下一次警示" aria-valuenow="' + toward + '" aria-valuemin="0" aria-valuemax="5"><div class="progress-fill" style="width:' + (toward * 20) + '%"></div></div><span class="subtle">距下次警示還差 ' + (5 - toward) + ' 次</span></td><td><span class="warning-badge ' + (warning.pending ? "" : "none") + '">' + warning.pending + ' 次待處理</span>' + (warning.earned > warning.pending ? '<small class="student-detail">已處理 ' + (warning.earned - warning.pending) + ' 次</small>' : "") + '</td><td><button class="long-absent-toggle ' + (student.longAbsent ? "active" : "") + '" type="button" data-action="toggle-long-absent" data-id="' + esc(student.id) + '" aria-pressed="' + Boolean(student.longAbsent) + '">' + (student.longAbsent ? "取消長缺" : "設為長缺") + '</button></td><td class="row-actions"><button type="button" data-action="delete-student" data-id="' + esc(student.id) + '" aria-label="移除 ' + esc(student.name) + '">移除</button></td></tr>';
    }).join("") + '</tbody></table></div>';
    container.querySelectorAll(".student-name").forEach((cell, index) => {
      const detail = studentDetail(students[index]);
      if (detail) cell.insertAdjacentHTML("beforeend", '<small class="student-detail">' + esc(detail) + '</small>');
    });
  }

  function monthlyExcellentStudents(month) {
    return sortedStudents().map((student) => {
      const entries = state.dailyRecords.filter((entry) => {
        if (entry.studentId !== student.id || !entry.date.startsWith(month + "-")) return false;
        const assignment = state.assignments.find((item) => item.id === entry.assignmentId);
        return assignment && isManagedStudent(assignment, student);
      });
      const academic = entries.filter((entry) => entry.status === "submitted" || entry.status === "missing");
      const missing = entries.filter((entry) => entry.status === "missing").length;
      return { student, missing, recorded: academic.length };
    }).filter((item) => item.recorded > 0 && item.missing <= 2).sort((a, b) => a.missing - b.missing || a.student.name.localeCompare(b.student.name, "zh-Hant"));
  }

  function renderRecords() {
    const openWarnings = new Set([...document.querySelectorAll("#warningRecords .warning-history[open]")].map((node) => node.closest("[data-warning-student]")?.dataset.warningStudent));
    const openStudents = new Set([...document.querySelectorAll("#missingRecords .student-record[open]")].map((node) => node.dataset.recordStudent));
    const warnings = sortedStudents().map((student) => ({ student, missing: studentMisses(student.id).length, progress: warningProgress(student.id) }))
      .filter((item) => item.progress.earned > 0)
      .sort((a, b) => b.progress.pending - a.progress.pending || b.missing - a.missing || a.student.name.localeCompare(b.student.name, "zh-Hant"));
    $("#warningRecords").innerHTML = warnings.length ? '<div class="warning-student-list">' + warnings.map(({ student, missing, progress }) => {
      const missHistory = studentMisses(student.id).sort((a, b) => b.date.localeCompare(a.date)).map((entry) => {
        const assignment = state.assignments.find((item) => item.id === entry.assignmentId);
        const label = assignment ? topicLabel(assignment) + " · " + assignment.title : "已移除功課";
        return '<li><time datetime="' + esc(entry.date) + '">' + esc(entry.date) + '</time><span>' + esc(label) + '</span></li>';
      }).join("");
      const handledHistory = progress.handled.map((entry) => '<li class="handled-entry"><span>第 ' + entry.warningNumber + ' 次警示 · ' + esc(localDateFromTimestamp(entry.handledAt)) + ' 已處理</span><button class="text-button" type="button" data-action="undo-warning" data-id="' + esc(entry.id) + '">撤回</button></li>').join("");
      return '<article class="warning-student ' + (progress.pending ? "has-pending" : "is-handled") + '" data-warning-student="' + esc(student.id) + '"><div class="warning-student-top"><div><strong>' + esc(student.name) + '</strong><small>累計欠交 ' + missing + ' 次 · 已產生 ' + progress.earned + ' 次警示</small></div><span class="warning-badge ' + (progress.pending ? "" : "none") + '">' + (progress.pending ? progress.pending + " 次待處理" : "全部已處理") + '</span></div>' + (progress.pending ? '<button class="small-button warning-handle-button" type="button" data-action="handle-warning" data-id="' + esc(student.id) + '">標記已處理 1 次</button>' : "") + '<details class="warning-history" ' + (openWarnings.has(student.id) ? "open" : "") + '><summary>查看欠交日期及處理紀錄</summary><ul>' + missHistory + handledHistory + '</ul></details></article>';
    }).join("") + '</div>' : '<p class="record-empty">這個班別暫時沒有警示學生。</p>';
    $("#recordsMonth").value = selectedRecordsMonth;
    const excellent = monthlyExcellentStudents(selectedRecordsMonth);
    $("#excellentSummary").textContent = "查看學生名單（" + excellent.length + " 位）";
    $("#excellentRecords").innerHTML = excellent.length ? '<ul class="record-list">' + excellent.map((item) => '<li><strong>' + esc(item.student.name) + '</strong><span class="excellent-count">欠交 ' + item.missing + ' 次</span></li>').join("") + '</ul>' : '<p class="record-empty">這個月份暫時沒有符合條件的學生。</p>';
    const missing = classMisses().slice().sort((a, b) => b.date.localeCompare(a.date) || (b.recordedAt || "").localeCompare(a.recordedAt || ""));
    const studentsById = new Map(state.students.map((student) => [student.id, student]));
    const assignmentsById = new Map(state.assignments.map((assignment) => [assignment.id, assignment]));
    const byStudent = new Map();
    missing.forEach((entry) => {
      if (!byStudent.has(entry.studentId)) byStudent.set(entry.studentId, { student: studentsById.get(entry.studentId), studentId: entry.studentId, entries: [] });
      byStudent.get(entry.studentId).entries.push(entry);
    });
    const studentGroups = [...byStudent.values()].sort((a, b) => b.entries.length - a.entries.length || b.entries[0].date.localeCompare(a.entries[0].date) || (a.student?.name || "").localeCompare(b.student?.name || "", "zh-Hant"));
    $("#missingRecordsCount").textContent = missing.length + " 筆 · " + studentGroups.length + " 位學生";
    $("#missingRecords").innerHTML = studentGroups.length ? '<div class="student-record-grid">' + studentGroups.map((group) => {
      const latestDate = group.entries[0].date;
      const events = group.entries.map((entry) => {
        const assignment = assignmentsById.get(entry.assignmentId);
        const title = assignment?.title || "已移除功課";
        const detail = assignment ? [topicLabel(assignment), assignment.detailTopic].filter(Boolean).join(" · ") : "";
        return '<li><time datetime="' + esc(entry.date) + '">' + esc(entry.date) + '</time><span><strong>' + esc(title) + '</strong>' + (detail ? '<small>' + esc(detail) + '</small>' : "") + '</span></li>';
      }).join("");
      return '<details class="student-record" data-record-student="' + esc(group.studentId) + '" ' + (openStudents.has(group.studentId) ? "open" : "") + '><summary><span class="student-record-identity"><strong>' + esc(group.student?.name || "已移除學生") + '</strong><small>最近記錄 <time datetime="' + esc(latestDate) + '">' + esc(latestDate) + '</time></small></span><span class="student-record-tail"><span class="student-record-count">' + group.entries.length + ' 次欠交</span><span class="student-record-chevron" aria-hidden="true">⌄</span></span></summary><ol class="student-record-events">' + events + '</ol></details>';
    }).join("") + '</div>' : '<p class="record-empty">這個班別暫時沒有欠交記錄。</p>';
  }

  function handleWarning(studentId) {
    const student = state.students.find((item) => item.id === studentId && item.classId === activeClassId);
    if (!student) return;
    const number = warningProgress(studentId).next;
    if (!number) return;
    if (!Array.isArray(state.warningsHandled)) state.warningsHandled = [];
    const id = "warning-" + studentId + "-" + number;
    const previous = state.warningsHandled.find((item) => item.id === id);
    const oldRecord = previous ? { ...previous } : null;
    if (previous) { previous.handledAt = new Date().toISOString(); previous.revokedAt = null; }
    else state.warningsHandled.push({ id, studentId, warningNumber: number, handledAt: new Date().toISOString() });
    if (!saveState()) {
      if (previous) Object.assign(previous, oldRecord);
      else state.warningsHandled = state.warningsHandled.filter((item) => item.id !== id);
      return;
    }
    render();
    toast(student.name + " 的第 " + number + " 次警示已標記處理。");
  }

  function undoWarning(id) {
    const record = (state.warningsHandled || []).find((item) => item.id === id && !item.revokedAt);
    if (!record || !state.students.some((student) => student.id === record.studentId && student.classId === activeClassId)) return;
    record.revokedAt = new Date().toISOString();
    if (!saveState()) { delete record.revokedAt; return; }
    render();
    toast("已撤回這次警示的處理標記。");
  }

  function render() {
    renderTabs();
    renderOverview();
    $(".class-section").hidden = activeView === "today";
    $(".overview").hidden = activeView === "today";
    $("#todayView").hidden = activeView !== "today";
    $("#assignmentsView").hidden = activeView !== "assignments";
    $("#studentsView").hidden = activeView !== "students";
    $("#archiveView").hidden = activeView !== "archive";
    $("#recordsView").hidden = activeView !== "records";
    document.querySelectorAll(".nav-link").forEach((node) => node.classList.toggle("active", node.dataset.view === activeView));
    if (activeView === "assignments") renderAssignments();
    else {
      ++renderSerial;
      releaseCardUrls();
      if (activeView === "today") renderToday();
      else if (activeView === "students") renderStudents();
      else if (activeView === "archive") renderArchive();
      else renderRecords();
    }
  }

  function makeOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function syncTopicCustom() {
    const show = !TOPICS[activeClassId] || $("#assignmentTopicSelect").value === "other";
    $("#topicCustomField").hidden = !show;
    $("#assignmentTopicCustom").required = show;
  }

  function syncNameCustom() {
    const show = $("#assignmentNameSelect").value === "other";
    $("#assignmentTitleField").hidden = !show;
    $("#assignmentTitle").required = show;
  }

  function setupAssignmentFields(assignment) {
    const list = TOPICS[activeClassId];
    const select = $("#assignmentTopicSelect");
    const custom = $("#assignmentTopicCustom");
    select.replaceChildren(makeOption("", "選擇課題"));
    if (list) {
      list.forEach((entry, index) => select.add(makeOption(String(index), entry[0] ? "第 " + entry[0] + " 章｜" + entry[1] : entry[1])));
      select.add(makeOption("other", "其他課題（自行輸入）"));
      $("#topicSelectField").hidden = false;
      select.required = true;
      const matched = list.findIndex((entry) => entry[0] === String(assignment?.chapter || "") && entry[1] === assignment?.topic);
      select.value = matched >= 0 ? String(matched) : assignment?.topic ? "other" : "";
      custom.value = matched >= 0 ? "" : assignment?.topic || "";
    } else {
      $("#topicSelectField").hidden = true;
      select.required = false;
      custom.value = assignment?.topic || "";
    }
    syncTopicCustom();
    const choice = $("#assignmentNameSelect");
    const standard = HOMEWORK_NAMES.includes(assignment?.title);
    choice.value = standard ? assignment.title : assignment?.title ? "other" : "";
    $("#assignmentTitle").value = standard ? "" : assignment?.title || "";
    syncNameCustom();
  }

  function selectedTopic() {
    const list = TOPICS[activeClassId];
    if (!list) return { topic: $("#assignmentTopicCustom").value.trim(), chapter: "" };
    const choice = $("#assignmentTopicSelect").value;
    if (choice === "other") return { topic: $("#assignmentTopicCustom").value.trim(), chapter: "" };
    if (choice === "") return { topic: "", chapter: "" };
    const entry = list[Number(choice)];
    return entry ? { topic: entry[1], chapter: entry[0] } : { topic: "", chapter: "" };
  }

  function openAssignmentForm(id) {
    const assignment = id ? state.assignments.find((item) => item.id === id) : null;
    if (assignment?.archivedAt) return;
    $("#assignmentForm").reset();
    setupAssignmentFields(assignment);
    $("#assignmentId").value = assignment?.id || "";
    $("#assignmentDetailTopic").value = assignment?.detailTopic || "";
    $("#assignmentDue").value = assignment?.due || todayDate();
    $("#assignmentDialogTitle").textContent = assignment ? "編輯功課" : "新增功課";
    $("#selectedFile").textContent = assignment?.sampleType ? `目前已有樣本：${assignment.sampleName || "樣本檔案"}。選擇新檔案可替換。` : "";
    showDialog("assignmentDialog");
    (TOPICS[activeClassId] ? $("#assignmentTopicSelect") : $("#assignmentTopicCustom")).focus();
  }

  async function saveAssignment(event) {
    event.preventDefault();
    const nameChoice = $("#assignmentNameSelect").value;
    const title = nameChoice === "other" ? $("#assignmentTitle").value.trim() : nameChoice;
    const topicData = selectedTopic();
    const due = $("#assignmentDue").value;
    const file = $("#assignmentSample").files[0];
    if (!title || !due || !topicData.topic) return toast("請選擇課題及功課名稱。", true);
    if (file && !["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"].includes(file.type)) return toast("請選擇 JPG、PNG、WebP、GIF 或 PDF 檔案。", true);
    if (file && file.size > 15 * 1024 * 1024) return toast("樣本檔案不可超過 15 MB。", true);
    const id = $("#assignmentId").value || uid();
    if (file) {
      try { await putSample(id, file); }
      catch (error) { console.error(error); return toast("樣本未能儲存，請檢查瀏覽器儲存空間。", true); }
    }
    const existing = state.assignments.find((item) => item.id === id);
    const updated = { id, classId: activeClassId, title, topic: topicData.topic, chapter: topicData.chapter, detailTopic: $("#assignmentDetailTopic").value.trim(), due, createdAt: existing?.createdAt || new Date().toISOString(), sampleType: file?.type || existing?.sampleType || "", sampleName: file?.name || existing?.sampleName || "", sampleUpdatedAt: file ? new Date().toISOString() : existing?.sampleUpdatedAt || null };
    if (!existing) updated.excludedStudentIds = classStudents().filter((student) => student.longAbsent).map((student) => student.id);
    if (existing) Object.assign(existing, updated);
    else state.assignments.push(updated);
    if (!saveState()) return;
    closeDialog($("#assignmentDialog"));
    render();
    if (!existing && due < todayDate()) {
      openMissingForm(id);
      toast("已加入過往功課。請補錄原收交日及今天仍欠交的學生。");
    } else {
      toast(existing ? "功課已更新。" : "功課已加入。可以記錄第一次收交情況。");
    }
  }

  function openStudentForm() {
    $("#studentForm").reset();
    showDialog("studentDialog");
    $("#studentNames").focus();
  }

  function saveStudents(event) {
    event.preventDefault();
    const names = $("#studentNames").value.split(/[\r\n]+/).map((name) => name.trim()).filter(Boolean);
    const students = classStudents();
    const existing = new Set(students.map((item) => item.name.toLocaleLowerCase()));
    const newNames = names.filter((name) => {
      const key = name.toLocaleLowerCase();
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    if (!newNames.length) return toast("名單內的學生已經存在。", true);
    let nextOrder = Math.max(-1, ...students.map((student) => Number.isFinite(student.order) ? student.order : -1)) + 1;
    students.forEach((student) => {
      if (!Number.isFinite(student.order)) student.order = nextOrder++;
    });
    newNames.forEach((name) => {
      state.students.push({ id: uid(), classId: activeClassId, name, longAbsent: false, order: nextOrder++ });
    });
    const added = newNames.length;
    if (!saveState()) return;
    closeDialog($("#studentDialog"));
    render();
    toast(`已加入 ${added} 位學生。`);
  }

  function openMissingForm(assignmentId, editExisting = false) {
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment || assignment.archivedAt || (editExisting ? !assignment.firstRecordedOn : Boolean(assignment.firstRecordedOn))) return;
    activeClassId = assignment.classId;
    if (!classStudents().length) { activeView = "students"; render(); openStudentForm(); return; }
    if (!assignmentStudents(assignment).length) return toast("這份功課沒有需要管理的學生。", true);
    $("#missingAssignmentId").value = assignmentId;
    $("#missingAssignmentName").textContent = assignment.title;
    $("#missingDialogTitle").textContent = editExisting ? "修改首次收交記錄" : "第一次記錄欠交";
    $("#missingFormNote").textContent = editExisting
      ? "可修正首次收交當日的欠交或缺席；取消勾選會改為當日已交。欠交次數和警示會重新計算。"
      : "勾選當天欠交或缺席的學生；未勾選的學生會記為「已交」。欠交計 1 次，缺席不計。";
    $("#missingForm button[type=submit]").textContent = editExisting ? "儲存修改" : "儲存紀錄";
    const dateField = $("#firstRecordDate");
    dateField.value = editExisting ? assignment.firstRecordedOn : assignment.due < todayDate() ? assignment.due : todayDate();
    dateField.max = todayDate();
    dateField.disabled = editExisting;
    $("#studentSearch").value = "";
    selectedBatchStatuses = new Map();
    selectedTodayMissingIds = new Set();
    if (editExisting) assignmentStudents(assignment).forEach((student) => {
      const status = firstDayEntry(assignment, student.id)?.status;
      if (status === "missing" || status === "absent") selectedBatchStatuses.set(student.id, status);
    });
    renderMissingChoices();
    showDialog("missingDialog");
  }

  function renderMissingChoices() {
    const search = $("#studentSearch").value.trim().toLocaleLowerCase();
    const assignment = state.assignments.find((item) => item.id === $("#missingAssignmentId").value);
    const editing = Boolean(assignment?.firstRecordedOn);
    const historical = !editing && $("#firstRecordDate").value < todayDate();
    $("#historicalRecordNote").hidden = !historical;
    const matching = sortedStudents().filter((item) => assignment && isManagedStudent(assignment, item) && (item.name.toLocaleLowerCase().includes(search) || String(item.number || "").includes(search)));
    $("#missingStudentList").innerHTML = matching.length ? matching.map((item) => {
      const selected = selectedBatchStatuses.get(item.id);
      const firstDay = editing ? firstDayEntry(assignment, item.id) : null;
      const label = selected === "missing" ? "當日欠交" : selected === "absent" ? "當日缺席" : editing && !firstDay ? "當日未記錄" : "當日已交";
      const todayMissing = selectedTodayMissingIds.has(item.id);
      return '<div class="batch-student-row"><div class="batch-student-name"><strong>' + esc(item.name) + '</strong><small>' + label + '</small></div><div class="batch-student-actions"><label class="batch-status-option"><input type="checkbox" data-student-id="' + esc(item.id) + '" value="missing" ' + (selected === "missing" ? "checked" : "") + '> 欠交</label><label class="batch-status-option"><input type="checkbox" data-student-id="' + esc(item.id) + '" value="absent" ' + (selected === "absent" ? "checked" : "") + '> 缺席</label>' + (historical ? '<label class="batch-status-option today-missing-option"><input type="checkbox" data-today-missing-student="' + esc(item.id) + '" ' + (todayMissing ? "checked" : "") + (selected ? "" : " disabled") + '> 今天仍未交</label>' : "") + '</div></div>';
    }).join("") : '<div class="check-empty">找不到符合的學生</div>';
    updateMissingSelection();
  }

  function updateMissingSelection() {
    const values = [...selectedBatchStatuses.values()];
    const missing = values.filter((value) => value === "missing").length;
    const absent = values.filter((value) => value === "absent").length;
    const assignment = state.assignments.find((item) => item.id === $("#missingAssignmentId").value);
    const students = assignmentStudents(assignment);
    const editing = Boolean(assignment.firstRecordedOn);
    const unrecorded = editing ? students.filter((student) => !firstDayEntry(assignment, student.id) && !selectedBatchStatuses.has(student.id)).length : 0;
    const submitted = students.length - values.length - unrecorded;
    const todayCount = !editing && $("#firstRecordDate").value < todayDate() ? ' · 今天仍未交 ' + selectedTodayMissingIds.size + ' 位' : '';
    $("#missingSelectionCount").textContent = '當日已交 ' + submitted + ' 位 · 欠交 ' + missing + ' 位 · 缺席 ' + absent + ' 位' + (unrecorded ? ' · 未記錄 ' + unrecorded + ' 位' : '') + todayCount;
    $("#missingForm button[type=submit]").disabled = false;
  }

  function saveMissing(event) {
    event.preventDefault();
    const assignment = state.assignments.find((item) => item.id === $("#missingAssignmentId").value);
    const date = $("#firstRecordDate").value;
    if (!assignment || assignment.archivedAt) return;
    const editing = Boolean(assignment.firstRecordedOn);
    if (editing && date !== assignment.firstRecordedOn) return toast("修改首次收交時不能更改日期。", true);
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) || date > todayDate()) return toast("請選擇今天或之前的首次收交日期。", true);
    const students = assignmentStudents(assignment);
    if (!students.length) return;
    const updates = students.map((student) => {
      const original = editing ? firstDayEntry(assignment, student.id) : null;
      const selected = selectedBatchStatuses.get(student.id);
      if (editing && !original && !selected) return null;
      return { student, original, status: selected || "submitted" };
    }).filter(Boolean);
    const changed = editing ? updates.filter((item) => item.original?.status !== item.status) : updates;
    if (editing && !changed.length) {
      closeDialog($("#missingDialog"));
      return toast("首次收交記錄沒有變更。");
    }
    const correctedSubmitted = changed.filter((item) => item.status === "submitted" && item.original?.status !== "submitted");
    const correctedIds = new Set(correctedSubmitted.map((item) => item.student.id));
    const laterEntries = editing ? state.dailyRecords.filter((item) => item.assignmentId === assignment.id && correctedIds.has(item.studentId) && item.date > date) : [];
    if (laterEntries.length && !confirm("有 " + correctedIds.size + " 位學生在首次收交日後仍有這份功課的記錄。改為當日已交會移除其較後日期的 " + laterEntries.length + " 筆記錄及相關欠交次數。確定儲存？")) return;
    const before = new Map(students.map((student) => [student.id, Math.floor(studentMisses(student.id).length / 5)]));
    const oldRecords = state.dailyRecords;
    if (laterEntries.length) state.dailyRecords = state.dailyRecords.filter((item) => !(item.assignmentId === assignment.id && correctedIds.has(item.studentId) && item.date > date));
    changed.forEach((item) => upsertDailyRecord(assignment, item.student.id, date, item.status));
    const todayMissingIds = !editing && date < todayDate() ? [...selectedTodayMissingIds].filter((id) => selectedBatchStatuses.has(id)) : [];
    todayMissingIds.forEach((id) => upsertDailyRecord(assignment, id, todayDate(), "missing"));
    if (!editing) assignment.firstRecordedOn = date;
    if (!saveState()) {
      state.dailyRecords = oldRecords;
      if (!editing) assignment.firstRecordedOn = null;
      return;
    }
    closeDialog($("#missingDialog"));
    render();
    if (editing) {
      const dayRecords = assignmentEntries(assignment.id).filter((item) => item.date === date);
      const submitted = dayRecords.filter((item) => item.status === "submitted").length;
      const missing = dayRecords.filter((item) => item.status === "missing").length;
      const absent = dayRecords.filter((item) => item.status === "absent").length;
      return toast("首次收交已修改：已交 " + submitted + " 位、欠交 " + missing + " 位、缺席 " + absent + " 位；警示已重新計算。" + (laterEntries.length ? " 已移除 " + laterEntries.length + " 筆較後日期記錄。" : ""));
    }
    const missing = [...selectedBatchStatuses.values()].filter((value) => value === "missing").length;
    const absent = [...selectedBatchStatuses.values()].filter((value) => value === "absent").length;
    const newWarnings = students.filter((student) => Math.floor(studentMisses(student.id).length / 5) > before.get(student.id)).length;
    toast('首次收交已記錄：已交 ' + (students.length - missing - absent) + ' 位、欠交 ' + missing + ' 位、缺席 ' + absent + ' 位。' + (todayMissingIds.length ? ' 今天仍未交 ' + todayMissingIds.length + ' 位，各再記 1 次。' : '') + (newWarnings ? ' ' + newWarnings + ' 位學生達到新警示。' : ''));
  }

  function nextDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return localDateFromTimestamp(new Date(year, month - 1, day + 1));
  }

  function latestEntryBefore(assignmentId, studentId, date) {
    return assignmentEntries(assignmentId).filter((item) => item.studentId === studentId && item.date < date).sort((a, b) => a.date.localeCompare(b.date) || (a.recordedAt || "").localeCompare(b.recordedAt || "") || a.id.localeCompare(b.id)).at(-1);
  }

  function dailyCandidates(assignment, date) {
    return sortedStudents().filter((student) => {
      if (!isManagedStudent(assignment, student)) return false;
      const firstDay = latestEntry(assignment.id, student.id, assignment.firstRecordedOn);
      if (firstDay?.date === assignment.firstRecordedOn && firstDay.status === "submitted") return false;
      const status = latestEntryBefore(assignment.id, student.id, date)?.status;
      return status === "missing" || status === "absent";
    });
  }

  function loadDailySelections(assignment, date) {
    selectedDailyStatuses = new Map();
    dailyCandidates(assignment, date).forEach((student) => {
      const onDate = latestEntry(assignment.id, student.id, date);
      if (onDate?.date === date && (onDate.status === "submitted" || onDate.status === "absent")) selectedDailyStatuses.set(student.id, onDate.status);
    });
  }

  function openTracking(assignmentId) {
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) return;
    if (!assignment.archivedAt && !assignment.firstRecordedOn) return openMissingForm(assignmentId);
    if (!assignment.archivedAt && nextDate(assignment.firstRecordedOn) > todayDate()) return toast("首次收交已記錄；下一天起可更新待交名單。");
    $("#trackingAssignmentId").value = assignmentId;
    $("#trackingTitle").textContent = assignment.title;
    $("#trackingEyebrow").textContent = assignment.archivedAt ? "封存名單" : "每日補交記錄";
    $("#trackingHelp").textContent = assignment.archivedAt ? "以下是封存當時的全班收交狀態，僅供查看。" : "名單只顯示仍待交的學生。當天勾選「已補交」或「缺席」；未勾選者在儲存時記為繼續欠交。";
    $("#trackingDateLabel").hidden = Boolean(assignment.archivedAt);
    $("#trackingSavebar").hidden = Boolean(assignment.archivedAt);
    $("#trackingDate").value = todayDate();
    $("#trackingDate").min = assignment.firstRecordedOn ? nextDate(assignment.firstRecordedOn) : "";
    $("#trackingDate").max = todayDate();
    $("#trackingSearch").value = "";
    if (!assignment.archivedAt) loadDailySelections(assignment, $("#trackingDate").value);
    renderTracking();
    showDialog("trackingDialog");
  }

  function renderTracking() {
    const assignmentId = $("#trackingAssignmentId").value;
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) return;
    const search = $("#trackingSearch").value.trim().toLocaleLowerCase();
    const container = $("#trackingRows");
    const previousScroll = container.scrollTop;
    if (assignment.archivedAt) {
      const snapshot = assignment.archiveSnapshot || [];
      const matching = snapshot.filter((item) => (item.name + " " + (item.detail || "")).toLocaleLowerCase().includes(search));
      const pending = snapshot.filter((item) => item.status === "missing" || item.status === "absent").length;
      $("#trackingSummary").textContent = snapshot.length + " 位學生 · 封存時 " + pending + " 位待交";
      container.innerHTML = matching.length ? matching.map((item) => {
        const label = { missing: "未交", submitted: "已交", absent: "缺席待交", "absent-submitted": "缺席後已交", unrecorded: "未記錄" }[item.status] || "未記錄";
        const style = { missing: "pending", submitted: "submitted", absent: "absent", "absent-submitted": "submitted", unrecorded: "neutral" }[item.status] || "neutral";
        const entries = assignmentEntries(assignmentId).filter((entry) => entry.studentId === item.studentId).sort((a, b) => b.date.localeCompare(a.date) || (b.recordedAt || "").localeCompare(a.recordedAt || ""));
        const history = entries.map((entry) => '<li><time>' + entry.date + '</time><span>' + ({ missing: "未交", submitted: "已交", absent: "缺席" }[entry.status] || entry.status) + '</span></li>').join("");
        return '<div class="tracking-row archived-row"><div class="tracking-person"><strong>' + esc(item.name) + '</strong><small>' + esc(item.detail || "") + '</small></div><div class="tracking-info"><span class="tracking-status ' + style + '">' + label + '</span><small>累計欠交 ' + (item.missingCount ?? "—") + ' 次</small></div>' + (entries.length ? '<details class="daily-history"><summary>查看每日記錄（' + entries.length + '）</summary><ul>' + history + '</ul></details>' : "") + '</div>';
      }).join("") : '<div class="check-empty">找不到符合的學生</div>';
    } else {
      const date = $("#trackingDate").value;
      const valid = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) && date >= nextDate(assignment.firstRecordedOn) && date <= todayDate();
      const candidates = valid ? dailyCandidates(assignment, date) : [];
      const visible = candidates.filter((student) => (student.name + " " + (student.form || "") + " " + (student.number || "")).toLocaleLowerCase().includes(search));
      const selected = [...selectedDailyStatuses.values()];
      const submitted = selected.filter((status) => status === "submitted").length;
      const absent = selected.filter((status) => status === "absent").length;
      $("#trackingSummary").textContent = valid ? candidates.length + " 位待處理 · 補交 " + submitted + " · 缺席 " + absent + " · 繼續欠交 " + (candidates.length - selected.length) : "請選擇有效日期";
      $("#saveTrackingButton").disabled = !valid || candidates.length === 0;
      container.innerHTML = visible.length ? visible.map((student) => {
        const prior = latestEntryBefore(assignmentId, student.id, date);
        const choice = selectedDailyStatuses.get(student.id);
        const entries = assignmentEntries(assignmentId).filter((item) => item.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date) || (b.recordedAt || "").localeCompare(a.recordedAt || ""));
        const count = entries.filter((item) => item.status === "missing").length;
        const warnings = warningProgress(student.id).pending;
        const history = entries.map((entry) => '<li><time>' + entry.date + '</time><span>' + ({ missing: "未交", submitted: "已交", absent: "缺席" }[entry.status] || entry.status) + '</span></li>').join("");
        return '<div class="tracking-row daily-row"><div class="tracking-person"><strong>' + esc(student.name) + '</strong><small>' + esc(studentDetail(student)) + '</small></div><div class="tracking-info"><span class="tracking-status ' + (prior?.status === "absent" ? "absent" : "pending") + '">' + (prior?.status === "absent" ? "上次缺席" : "仍待補交") + '</span><small>本份功課累計欠交 ' + count + ' 次 · 所有功課合計 ' + warnings + ' 次待處理警示</small></div><div class="daily-options" role="group" aria-label="' + esc(student.name) + ' 當日狀態"><label><input type="checkbox" data-daily-student="' + esc(student.id) + '" value="submitted" ' + (choice === "submitted" ? "checked" : "") + '> 已補交</label><label><input type="checkbox" data-daily-student="' + esc(student.id) + '" value="absent" ' + (choice === "absent" ? "checked" : "") + '> 缺席</label></div><details class="daily-history"><summary>查看每日記錄（' + entries.length + '）</summary><ul>' + history + '</ul></details></div>';
      }).join("") : '<div class="check-empty">' + (valid && candidates.length === 0 ? "這天沒有待交學生" : valid ? "找不到符合的學生" : "請選擇有效日期") + '</div>';
    }
    container.scrollTop = previousScroll;
  }

  function saveDailyTracking() {
    const assignment = state.assignments.find((item) => item.id === $("#trackingAssignmentId").value);
    const date = $("#trackingDate").value;
    if (!assignment || assignment.archivedAt || !assignment.firstRecordedOn) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) || date < nextDate(assignment.firstRecordedOn) || date > todayDate()) return toast("請選擇首次收交日之後、今天或之前的日期。", true);
    const candidates = dailyCandidates(assignment, date);
    if (!candidates.length) return;
    const conflict = candidates.find((student) => selectedDailyStatuses.get(student.id) === "submitted" && assignmentEntries(assignment.id).some((item) => item.studentId === student.id && item.date > date));
    if (conflict) return toast(conflict.name + " 已有較後日期紀錄；請先處理較後日期，避免紀錄互相矛盾。", true);
    const before = new Map(candidates.map((student) => [student.id, Math.floor(studentMisses(student.id).length / 5)]));
    const oldRecords = state.dailyRecords;
    candidates.forEach((student) => upsertDailyRecord(assignment, student.id, date, selectedDailyStatuses.get(student.id) || "missing"));
    if (!saveState()) { state.dailyRecords = oldRecords; return; }
    loadDailySelections(assignment, date);
    render();
    renderTracking();
    const statuses = candidates.map((student) => selectedDailyStatuses.get(student.id) || "missing");
    const submitted = statuses.filter((status) => status === "submitted").length;
    const absent = statuses.filter((status) => status === "absent").length;
    const newWarnings = candidates.filter((student) => Math.floor(studentMisses(student.id).length / 5) > before.get(student.id)).length;
    toast(date + " 已記錄：補交 " + submitted + " 位、缺席 " + absent + " 位、繼續欠交 " + (candidates.length - submitted - absent) + " 位。" + (newWarnings ? " " + newWarnings + " 位學生達到新警示。" : ""));
  }

  async function deleteAssignment(id) {
    const assignment = state.assignments.find((item) => item.id === id);
    if (!assignment || assignment.archivedAt || !confirm(`確定刪除「${assignment.title}」及其所有每日收交紀錄？`)) return;
    state.assignments = state.assignments.filter((item) => item.id !== id);
    state.misses = state.misses.filter((item) => item.assignmentId !== id);
    state.absences = state.absences.filter((item) => item.assignmentId !== id);
    state.dailyRecords = state.dailyRecords.filter((item) => item.assignmentId !== id);
    if (!saveState()) return;
    if (assignment.sampleType) { try { await deleteSample(id); } catch (error) { console.warn("Unable to delete sample", error); } }
    render();
    toast("功課已刪除。");
  }

  function archiveAssignment(id) {
    const assignment = state.assignments.find((item) => item.id === id);
    if (!assignment || assignment.archivedAt || assignment.due >= todayDate()) return;
    assignment.archiveSnapshot = sortedStudents().filter((student) => isManagedStudent(assignment, student)).map((student) => ({
      studentId: student.id,
      name: student.name,
      detail: studentDetail(student),
      status: latestEntry(id, student.id)?.status || "unrecorded",
      missingCount: assignmentMisses(id).filter((item) => item.studentId === student.id).length
    }));
    assignment.archivedAt = new Date().toISOString();
    if (!saveState()) return;
    render();
    toast("功課已封存，當時的全班收交名單已保存。");
  }

  function restoreAssignment(id) {
    const assignment = state.assignments.find((item) => item.id === id);
    if (!assignment?.archivedAt) return;
    assignment.archivedAt = null;
    if (!saveState()) return;
    render();
    toast("功課已取消封存，可繼續更新每日收交狀態。");
  }

  function toggleLongAbsent(id) {
    const student = state.students.find((item) => item.id === id && item.classId === activeClassId);
    if (!student) return;
    const oldValue = Boolean(student.longAbsent);
    student.longAbsent = !oldValue;
    if (!saveState()) { student.longAbsent = oldValue; return; }
    render();
    toast(student.name + (student.longAbsent ? " 已設為長缺；之後新增的功課會略過他。" : " 已取消長缺；之後新增的功課會納入管理。"));
  }

  function deleteStudent(id) {
    const student = state.students.find((item) => item.id === id);
    if (!student || !confirm(`確定移除「${student.name}」及其每日收交紀錄？已封存名單會保留封存當時的資料。`)) return;
    state.students = state.students.filter((item) => item.id !== id);
    state.misses = state.misses.filter((item) => item.studentId !== id);
    state.absences = state.absences.filter((item) => item.studentId !== id);
    state.dailyRecords = state.dailyRecords.filter((item) => item.studentId !== id);
    state.excellentByMonth = state.excellentByMonth.filter((item) => item.studentId !== id);
    state.warningsHandled = (state.warningsHandled || []).filter((item) => item.studentId !== id);
    state.assignments.forEach((assignment) => { if (assignment.excludedStudentIds) assignment.excludedStudentIds = assignment.excludedStudentIds.filter((studentId) => studentId !== id); });
    if (!saveState()) return;
    render();
    toast("學生及相關紀錄已移除。");
  }

  function blobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlAsBlob(dataUrl) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new Error("Invalid sample data");
    const bytes = atob(match[2]);
    const output = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index++) output[index] = bytes.charCodeAt(index);
    return new Blob([output], { type: match[1] });
  }

  async function exportBackup() {
    const button = $("#exportBackupButton");
    button.disabled = true;
    try {
      const samples = [];
      for (const assignment of state.assignments) {
        if (!assignment.sampleType) continue;
        const file = await getSample(assignment.id);
        if (file) samples.push({ assignmentId: assignment.id, data: await blobAsDataUrl(file) });
      }
      const backup = { format: "homework-record-book", version: 1, exportedAt: new Date().toISOString(), data: state, samples };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "homework-record-book-" + todayDate() + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast("已匯出完整備份，請妥善保存。");
    } catch (error) {
      console.error("Unable to export backup", error);
      toast("備份未能匯出，請檢查樣本或瀏覽器儲存空間。", true);
    } finally {
      button.disabled = false;
    }
  }

  async function importBackup(file) {
    if (!file) return;
    if (cloudConflict) return toast("請先處理雲端同步衝突，再匯入備份。", true);
    const button = $("#importBackupButton");
    button.disabled = true;
    try {
      const backup = JSON.parse(await file.text());
      const data = backup?.data;
      if (backup?.format !== "homework-record-book" || backup.version !== 1 || !data || !Array.isArray(data.classes) || !Array.isArray(data.students) || !Array.isArray(data.assignments) || !Array.isArray(data.misses) || !Array.isArray(data.dailyRecords) || !Array.isArray(backup.samples)) throw new Error("Invalid backup");
      const confirmMessage = cloudReady
        ? "匯入備份會取代目前雲端及此瀏覽器的班別、學生和功課紀錄。確定繼續？"
        : "匯入備份會取代此瀏覽器現有的班別、學生及功課紀錄。確定繼續？";
      if (!confirm(confirmMessage)) return;
      for (const item of backup.samples) {
        if (typeof item.assignmentId !== "string" || typeof item.data !== "string" || !data.assignments.some((assignment) => assignment.id === item.assignmentId)) throw new Error("Invalid sample");
        await putSample(item.assignmentId, dataUrlAsBlob(item.data));
      }
      data.rosterSeedVersion = 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (cloudReady) {
        applyCloudState(data);
        localStorage.setItem(CLOUD_DIRTY_KEY, "1");
        const synced = await syncCloudNow();
        if (!synced) throw new Error("Backup remains local until cloud sync succeeds");
        if (pendingSampleIds().length) {
          render();
          return toast("紀錄已匯入；部分樣本檔案仍待同步。", true);
        }
      }
      location.reload();
    } catch (error) {
      console.error("Unable to import backup", error);
      toast("匯入失敗。請選擇由本網站匯出的完整 JSON 備份。", true);
    } finally {
      button.disabled = false;
      $("#importBackupFile").value = "";
    }
  }

  function openSettings() {
    $("#classNameFields").innerHTML = state.classes.map((item, index) => `<label class="field">${item.subject} · 班別 ${index + 1}<input type="text" maxlength="40" required data-class-name="${item.id}" value="${esc(item.name)}"></label>`).join("");
    showDialog("settingsDialog");
  }

  function saveSettings(event) {
    event.preventDefault();
    state.classes.forEach((item) => { item.name = $(`[data-class-name="${item.id}"]`).value.trim() || item.name; });
    if (!saveState()) return;
    closeDialog($("#settingsDialog"));
    render();
    toast("班別名稱已更新。");
  }

  async function openPreview(id) {
    const assignment = state.assignments.find((item) => item.id === id);
    if (!assignment?.sampleType) return;
    $("#previewTitle").textContent = assignment.title;
    $("#previewContent").textContent = "載入樣本中…";
    showDialog("previewDialog");
    try {
      const file = await getSample(id);
      if (!$("#previewDialog").open) return;
      if (!file) throw new Error("Sample missing");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      $("#previewContent").innerHTML = assignment.sampleType === "application/pdf" ? `<iframe title="${esc(assignment.title)} PDF 第一頁" src="${previewUrl}#page=1&view=FitH"></iframe>` : `<img alt="${esc(assignment.title)} 樣本" src="${previewUrl}">`;
    } catch (error) {
      console.warn("Unable to open sample", error);
      $("#previewContent").textContent = "暫時無法開啟此樣本。";
    }
  }

  document.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close]");
    if (close) return closeDialog(close.closest("dialog"));
    const classTab = event.target.closest("[data-class]");
    if (classTab) { activeClassId = classTab.dataset.class; render(); return; }
    const filter = event.target.closest("[data-today-filter]");
    if (filter) { todayFilter = filter.dataset.todayFilter; renderToday(); return; }
    const nav = event.target.closest("[data-view]");
    if (nav) { activeView = nav.dataset.view; render(); return; }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    switch (button.dataset.action) {
      case "add-assignment": openAssignmentForm(); break;
      case "edit-assignment": openAssignmentForm(id); break;
      case "delete-assignment": deleteAssignment(id); break;
      case "archive-assignment": archiveAssignment(id); break;
      case "restore-assignment": restoreAssignment(id); break;
      case "preview": openPreview(id); break;
      case "add-student": openStudentForm(); break;
      case "delete-student": deleteStudent(id); break;
      case "toggle-long-absent": toggleLongAbsent(id); break;
      case "add-missing": openMissingForm(id); break;
      case "edit-first-record": openMissingForm(id, true); break;
      case "open-tracking": openTracking(id); break;
      case "today-status": recordTodayStatus(id, button.dataset.studentId, button.dataset.status); break;
      case "handle-warning": handleWarning(id); break;
      case "undo-warning": undoWarning(id); break;
    }
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(dialog); });
  });
  $("#previewDialog").addEventListener("close", () => {
    $("#previewContent").innerHTML = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  });
  $("#addAssignmentButton").addEventListener("click", () => openAssignmentForm());
  $("#addStudentButton").addEventListener("click", openStudentForm);
  $("#classSettingsButton").addEventListener("click", openSettings);
  $("#mobileSettingsButton").addEventListener("click", openSettings);
  $("#keepLocalChangesButton").addEventListener("click", () => resolveCloudConflict(true));
  $("#useCloudChangesButton").addEventListener("click", () => resolveCloudConflict(false));
  $("#exportBackupButton").addEventListener("click", exportBackup);
  $("#importBackupButton").addEventListener("click", () => $("#importBackupFile").click());
  $("#importBackupFile").addEventListener("change", (event) => importBackup(event.target.files[0]));
  $("#assignmentTopicSelect").addEventListener("change", syncTopicCustom);
  $("#assignmentNameSelect").addEventListener("change", syncNameCustom);
  $("#assignmentForm").addEventListener("submit", saveAssignment);
  $("#studentForm").addEventListener("submit", saveStudents);
  $("#missingForm").addEventListener("submit", saveMissing);
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#studentSearch").addEventListener("input", renderMissingChoices);
  $("#todaySearch").addEventListener("input", (event) => { todaySearch = event.target.value; renderToday(); });
  $("#firstRecordDate").addEventListener("change", () => { if ($("#firstRecordDate").value >= todayDate()) selectedTodayMissingIds.clear(); renderMissingChoices(); });
  $("#trackingSearch").addEventListener("input", renderTracking);
  $("#trackingDate").addEventListener("change", () => {
    const assignment = state.assignments.find((item) => item.id === $("#trackingAssignmentId").value);
    if (assignment && !assignment.archivedAt) loadDailySelections(assignment, $("#trackingDate").value);
    renderTracking();
  });
  $("#trackingRows").addEventListener("change", (event) => {
    if (!event.target.matches("input[type=checkbox][data-daily-student]")) return;
    const studentId = event.target.dataset.dailyStudent;
    if (event.target.checked) selectedDailyStatuses.set(studentId, event.target.value);
    else if (selectedDailyStatuses.get(studentId) === event.target.value) selectedDailyStatuses.delete(studentId);
    renderTracking();
  });
  $("#saveTrackingButton").addEventListener("click", saveDailyTracking);
  $("#missingStudentList").addEventListener("change", (event) => {
    if (event.target.matches("input[type=checkbox][data-today-missing-student]")) {
      const studentId = event.target.dataset.todayMissingStudent;
      if (event.target.checked && selectedBatchStatuses.has(studentId)) selectedTodayMissingIds.add(studentId);
      else selectedTodayMissingIds.delete(studentId);
      renderMissingChoices();
      return;
    }
    if (!event.target.matches("input[type=checkbox][data-student-id]")) return;
    const studentId = event.target.dataset.studentId;
    if (event.target.checked) selectedBatchStatuses.set(studentId, event.target.value);
    else if (selectedBatchStatuses.get(studentId) === event.target.value) { selectedBatchStatuses.delete(studentId); selectedTodayMissingIds.delete(studentId); }
    renderMissingChoices();
  });
  $("#recordsMonth").addEventListener("change", (event) => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
      selectedRecordsMonth = event.target.value;
      renderRecords();
    }
  });
  $("#assignmentSample").addEventListener("change", () => {
    const file = $("#assignmentSample").files[0];
    $("#selectedFile").textContent = file ? `已選擇：${file.name}` : "";
  });
  $("#cloudLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#cloudLoginButton");
    button.disabled = true;
    $("#cloudLoginMessage").textContent = "正在登入…";
    const { data, error } = await cloudClient.auth.signInWithPassword({
      email: $("#cloudEmail").value.trim(),
      password: $("#cloudPassword").value
    });
    if (error) {
      $("#cloudLoginMessage").textContent = "登入失敗，請確認電郵、密碼及教師帳戶設定。";
      button.disabled = false;
      return;
    }
    try {
      await startCloudSession(data.session);
      $("#cloudPassword").value = "";
      $("#cloudLoginMessage").textContent = "";
    } catch (syncError) {
      console.error("Unable to start cloud sync", syncError);
      $("#cloudLoginMessage").textContent = "雲端紀錄未能讀取。請檢查登入帳戶及資料庫設定。";
    } finally {
      button.disabled = false;
    }
  });
  $("#cloudSignOutButton").addEventListener("click", async () => {
    if (cloudConflict) return toast("請先處理同步衝突，再登出。", true);
    if (cloudPending || localStorage.getItem(CLOUD_DIRTY_KEY) === "1") {
      await syncCloudNow();
      if (localStorage.getItem(CLOUD_DIRTY_KEY) === "1") return toast("仍有未同步紀錄，請待同步完成後登出。", true);
    }
    const { error } = await cloudClient.auth.signOut();
    if (error) toast("登出未能完成，請稍後再試。", true);
  });
  window.addEventListener("online", () => {
    if (cloudReady && (cloudPending || localStorage.getItem(CLOUD_DIRTY_KEY) === "1")) queueCloudSave();
    else if (cloudReady) { refreshFromCloud(); uploadPendingSamples(); }
  });
  function refreshDay() {
    const current = todayDate();
    if (displayedDate === current) return;
    if (displayedDate && selectedRecordsMonth === displayedDate.slice(0, 7)) selectedRecordsMonth = current.slice(0, 7);
    displayedDate = current;
    $("#todayLabel").textContent = new Intl.DateTimeFormat("zh-HK", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
    if (!$("#appShell").hidden) render();
  }
  window.addEventListener("focus", refreshDay);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    refreshDay();
    if (cloudReady) refreshFromCloud();
  });
  setInterval(refreshDay, 60000);
  refreshDay();
  initializeCloud();
})();




