(function () {
  "use strict";

  const STORAGE_KEY = "homework-followup-v1";
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
  const state = loadState();
  let activeClassId = DEFAULT_CLASSES[0].id;
  let activeView = "assignments";
  let objectUrls = [];
  let previewUrl = null;
  let renderSerial = 0;
  let toastTimer;
  let selectedBatchStatuses = new Map();
  let selectedTodayMissingIds = new Set();
  let selectedDailyStatuses = new Map();
  let selectedRecordsMonth = todayDate().slice(0, 7);

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
          rosterSeedVersion: stored.rosterSeedVersion || 0
        };
      }
    } catch (error) {
      console.warn("Unable to read saved records", error);
    }
    if (!result) result = { classes: DEFAULT_CLASSES.map((item) => ({ ...item })), students: [], assignments: [], misses: [], absences: [], dailyRecords: [], dailyRecordVersion: 1, excellentByMonth: [], rosterSeedVersion: 0 };
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
      return true;
    } catch (error) {
      console.error("Unable to save records", error);
      toast("無法儲存紀錄，請檢查瀏覽器儲存空間。", true);
      return false;
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

  const getSample = (id) => sampleOperation("readonly", id);
  const putSample = (id, file) => sampleOperation("readwrite", id, file);
  const deleteSample = (id) => sampleOperation("readwrite", id);
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
    $("#warningCount").textContent = classStudents().reduce((sum, student) => sum + Math.floor(studentMisses(student.id).length / 5), 0);
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
      const detailTopic = assignment.detailTopic ? '<p class="assignment-detail-topic"><strong>詳細課題／備註：</strong>' + esc(assignment.detailTopic) + '</p>' : "";
      const archiveButton = assignment.due < todayDate() ? '<button class="small-button archive-button" type="button" data-action="archive-assignment" data-id="' + assignment.id + '" aria-label="封存 ' + esc(assignment.title) + '">封存</button>' : "";
      return '<article class="assignment-card"><button class="sample-thumb ' + (assignment.sampleType ? "has-file" : "") + '" type="button" data-action="' + (assignment.sampleType ? "preview" : "edit-assignment") + '" data-id="' + assignment.id + '" aria-label="' + (assignment.sampleType ? "查看" : "加入") + ' ' + esc(assignment.title) + ' 的功課樣本">' + thumb + '</button><div class="assignment-body"><div class="assignment-top"><div><p class="assignment-meta">繳交日期 · ' + formatDate(assignment.due) + (assignment.due < todayDate() ? " · 已過期" : "") + '</p><h3>' + esc(assignment.title) + '</h3>' + detailTopic + '</div><div class="assignment-actions"><button class="icon-button" type="button" data-action="edit-assignment" data-id="' + assignment.id + '" aria-label="編輯 ' + esc(assignment.title) + '">✎</button><button class="icon-button" type="button" data-action="delete-assignment" data-id="' + assignment.id + '" aria-label="刪除 ' + esc(assignment.title) + '">×</button></div></div><div class="assignment-status"><span class="status-pill ' + (counts.missing + counts.absent ? "" : "clear") + '">' + summary + '</span><span class="muted">累計 ' + misses.length + ' 次欠交 · 已交 ' + counts.submitted + ' 位 · 缺席 ' + counts.absent + ' 位</span></div><div class="missing-list">' + pendingList + '</div>' + absentList + submittedList + '<div class="assignment-footer">' + action + archiveButton + '</div></div></article>';
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
      const warnings = Math.floor(misses.length / 5);
      const toward = misses.length % 5;
      return '<tr><td class="student-name">' + esc(student.name) + (student.longAbsent ? ' <span class="long-absent-badge">長缺</span>' : "") + '</td><td><span class="count">' + pending + '</span></td><td><span class="count">' + misses.length + '</span><div class="progress-track" role="progressbar" aria-label="距離下一次警示" aria-valuenow="' + toward + '" aria-valuemin="0" aria-valuemax="5"><div class="progress-fill" style="width:' + (toward * 20) + '%"></div></div><span class="subtle">距下次警示還差 ' + (5 - toward) + ' 次</span></td><td><span class="warning-badge ' + (warnings ? "" : "none") + '">' + warnings + ' 次警示</span></td><td><button class="long-absent-toggle ' + (student.longAbsent ? "active" : "") + '" type="button" data-action="toggle-long-absent" data-id="' + esc(student.id) + '" aria-pressed="' + Boolean(student.longAbsent) + '">' + (student.longAbsent ? "取消長缺" : "設為長缺") + '</button></td><td class="row-actions"><button type="button" data-action="delete-student" data-id="' + esc(student.id) + '" aria-label="移除 ' + esc(student.name) + '">移除</button></td></tr>';
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
    const warnings = sortedStudents().map((student) => ({
      student,
      missing: studentMisses(student.id).length,
      count: Math.floor(studentMisses(student.id).length / 5)
    })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count || b.missing - a.missing || a.student.name.localeCompare(b.student.name, "zh-Hant"));
    $("#warningRecords").innerHTML = warnings.length ? '<ul class="record-list">' + warnings.map((item) => '<li><span><strong>' + esc(item.student.name) + '</strong><small>累計欠交 ' + item.missing + ' 次</small></span><span class="warning-badge">' + item.count + ' 次警示</span></li>').join("") + '</ul>' : '<p class="record-empty">這個班別暫時沒有警示學生。</p>';
    $("#recordsMonth").value = selectedRecordsMonth;
    const excellent = monthlyExcellentStudents(selectedRecordsMonth);
    $("#excellentRecords").innerHTML = excellent.length ? '<ul class="record-list">' + excellent.map((item) => '<li><strong>' + esc(item.student.name) + '</strong><span class="excellent-count">欠交 ' + item.missing + ' 次</span></li>').join("") + '</ul>' : '<p class="record-empty">這個月份暫時沒有符合條件的學生。</p>';
  }

  function render() {
    renderTabs();
    renderOverview();
    $("#assignmentsView").hidden = activeView !== "assignments";
    $("#studentsView").hidden = activeView !== "students";
    $("#archiveView").hidden = activeView !== "archive";
    $("#recordsView").hidden = activeView !== "records";
    document.querySelectorAll(".nav-link").forEach((node) => node.classList.toggle("active", node.dataset.view === activeView));
    if (activeView === "assignments") renderAssignments();
    else {
      ++renderSerial;
      releaseCardUrls();
      if (activeView === "students") renderStudents();
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
    const updated = { id, classId: activeClassId, title, topic: topicData.topic, chapter: topicData.chapter, detailTopic: $("#assignmentDetailTopic").value.trim(), due, createdAt: existing?.createdAt || new Date().toISOString(), sampleType: file?.type || existing?.sampleType || "", sampleName: file?.name || existing?.sampleName || "" };
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

  function openMissingForm(assignmentId) {
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment || assignment.archivedAt || assignment.firstRecordedOn) return;
    if (!classStudents().length) { activeView = "students"; render(); openStudentForm(); return; }
    if (!assignmentStudents(assignment).length) return toast("這份功課沒有需要管理的學生。", true);
    $("#missingAssignmentId").value = assignmentId;
    $("#missingAssignmentName").textContent = assignment.title;
    $("#firstRecordDate").value = assignment.due < todayDate() ? assignment.due : todayDate();
    $("#firstRecordDate").max = todayDate();
    $("#studentSearch").value = "";
    selectedBatchStatuses = new Map();
    selectedTodayMissingIds = new Set();
    renderMissingChoices();
    showDialog("missingDialog");
  }

  function renderMissingChoices() {
    const search = $("#studentSearch").value.trim().toLocaleLowerCase();
    const assignment = state.assignments.find((item) => item.id === $("#missingAssignmentId").value);
    const historical = $("#firstRecordDate").value < todayDate();
    $("#historicalRecordNote").hidden = !historical;
    const matching = sortedStudents().filter((item) => assignment && isManagedStudent(assignment, item) && (item.name.toLocaleLowerCase().includes(search) || String(item.number || "").includes(search)));
    $("#missingStudentList").innerHTML = matching.length ? matching.map((item) => {
      const selected = selectedBatchStatuses.get(item.id);
      const todayMissing = selectedTodayMissingIds.has(item.id);
      return '<div class="batch-student-row"><div class="batch-student-name"><strong>' + esc(item.name) + '</strong><small>' + (selected ? selected === "missing" ? "當日欠交" : "當日缺席" : "當日已交") + '</small></div><div class="batch-student-actions"><label class="batch-status-option"><input type="checkbox" data-student-id="' + esc(item.id) + '" value="missing" ' + (selected === "missing" ? "checked" : "") + '> 欠交</label><label class="batch-status-option"><input type="checkbox" data-student-id="' + esc(item.id) + '" value="absent" ' + (selected === "absent" ? "checked" : "") + '> 缺席</label>' + (historical ? '<label class="batch-status-option today-missing-option"><input type="checkbox" data-today-missing-student="' + esc(item.id) + '" ' + (todayMissing ? "checked" : "") + (selected ? "" : " disabled") + '> 今天仍未交</label>' : "") + '</div></div>';
    }).join("") : '<div class="check-empty">找不到符合的學生</div>';
    updateMissingSelection();
  }

  function updateMissingSelection() {
    const values = [...selectedBatchStatuses.values()];
    const missing = values.filter((value) => value === "missing").length;
    const absent = values.filter((value) => value === "absent").length;
    const assignment = state.assignments.find((item) => item.id === $("#missingAssignmentId").value);
    const submitted = assignmentStudents(assignment).length - values.length;
    const todayCount = $("#firstRecordDate").value < todayDate() ? ' · 今天仍未交 ' + selectedTodayMissingIds.size + ' 位' : '';
    $("#missingSelectionCount").textContent = '當日已交 ' + submitted + ' 位 · 欠交 ' + missing + ' 位 · 缺席 ' + absent + ' 位' + todayCount;
    $("#missingForm button[type=submit]").disabled = false;
  }

  function saveMissing(event) {
    event.preventDefault();
    const assignment = state.assignments.find((item) => item.id === $("#missingAssignmentId").value);
    const date = $("#firstRecordDate").value;
    if (!assignment || assignment.archivedAt || assignment.firstRecordedOn) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) || date > todayDate()) return toast("請選擇今天或之前的首次收交日期。", true);
    const students = assignmentStudents(assignment);
    if (!students.length) return;
    const before = new Map(students.map((student) => [student.id, Math.floor(studentMisses(student.id).length / 5)]));
    const oldRecords = state.dailyRecords;
    students.forEach((student) => upsertDailyRecord(assignment, student.id, date, selectedBatchStatuses.get(student.id) || "submitted"));
    const todayMissingIds = date < todayDate() ? [...selectedTodayMissingIds].filter((id) => selectedBatchStatuses.has(id)) : [];
    todayMissingIds.forEach((id) => upsertDailyRecord(assignment, id, todayDate(), "missing"));
    assignment.firstRecordedOn = date;
    if (!saveState()) { state.dailyRecords = oldRecords; assignment.firstRecordedOn = null; return; }
    closeDialog($("#missingDialog"));
    render();
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
        const count = studentMisses(student.id).length;
        const entries = assignmentEntries(assignmentId).filter((item) => item.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date) || (b.recordedAt || "").localeCompare(a.recordedAt || ""));
        const history = entries.map((entry) => '<li><time>' + entry.date + '</time><span>' + ({ missing: "未交", submitted: "已交", absent: "缺席" }[entry.status] || entry.status) + '</span></li>').join("");
        return '<div class="tracking-row daily-row"><div class="tracking-person"><strong>' + esc(student.name) + '</strong><small>' + esc(studentDetail(student)) + '</small></div><div class="tracking-info"><span class="tracking-status ' + (prior?.status === "absent" ? "absent" : "pending") + '">' + (prior?.status === "absent" ? "上次缺席" : "仍待補交") + '</span><small>累計 ' + count + ' 次欠交 · ' + Math.floor(count / 5) + ' 次警示</small></div><div class="daily-options" role="group" aria-label="' + esc(student.name) + ' 當日狀態"><label><input type="checkbox" data-daily-student="' + esc(student.id) + '" value="submitted" ' + (choice === "submitted" ? "checked" : "") + '> 已補交</label><label><input type="checkbox" data-daily-student="' + esc(student.id) + '" value="absent" ' + (choice === "absent" ? "checked" : "") + '> 缺席</label></div><details class="daily-history"><summary>查看每日記錄（' + entries.length + '）</summary><ul>' + history + '</ul></details></div>';
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
    const button = $("#importBackupButton");
    button.disabled = true;
    try {
      const backup = JSON.parse(await file.text());
      const data = backup?.data;
      if (backup?.format !== "homework-record-book" || backup.version !== 1 || !data || !Array.isArray(data.classes) || !Array.isArray(data.students) || !Array.isArray(data.assignments) || !Array.isArray(data.misses) || !Array.isArray(data.dailyRecords) || !Array.isArray(backup.samples)) throw new Error("Invalid backup");
      if (!confirm("匯入備份會取代此瀏覽器現有的班別、學生及功課紀錄。確定繼續？")) return;
      for (const item of backup.samples) {
        if (typeof item.assignmentId !== "string" || typeof item.data !== "string" || !data.assignments.some((assignment) => assignment.id === item.assignmentId)) throw new Error("Invalid sample");
        await putSample(item.assignmentId, dataUrlAsBlob(item.data));
      }
      data.rosterSeedVersion = 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
      case "open-tracking": openTracking(id); break;
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
  $("#todayLabel").textContent = new Intl.DateTimeFormat("zh-HK", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  render();
})();




