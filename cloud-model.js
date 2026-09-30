(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.HomeworkCloudModel = model;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";

  const collections = ["classes", "students", "assignments", "dailyRecords", "warningsHandled"];
  const metadata = ["dailyRecordVersion", "rosterSeedVersion", "misses", "absences", "excellentByMonth"];
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function same(a, b) { return stable(a) === stable(b); }
  function byId(items) { return new Map((items || []).map((item) => [String(item.id), item])); }

  function diff(before, after) {
    const patch = {};
    let changed = false;
    for (const key of collections) {
      const oldItems = byId(before[key]);
      const newItems = byId(after[key]);
      const upserts = [];
      const deletes = [];
      for (const [id, item] of newItems) {
        if (!oldItems.has(id) || !same(oldItems.get(id), item)) upserts.push(clone(item));
      }
      for (const id of oldItems.keys()) if (!newItems.has(id)) deletes.push(id);
      patch[key] = { upserts, deletes };
      if (upserts.length || deletes.length) changed = true;
    }
    const oldMeta = Object.fromEntries(metadata.map((key) => [key, before[key]]));
    const newMeta = Object.fromEntries(metadata.map((key) => [key, after[key]]));
    if (!same(oldMeta, newMeta)) {
      patch.metadata = clone(newMeta);
      changed = true;
    }
    return changed ? patch : null;
  }

  function apply(remote, patch) {
    const result = clone(remote);
    for (const key of collections) {
      const change = patch[key] || { upserts: [], deletes: [] };
      const deleted = new Set(change.deletes);
      const upserts = byId(change.upserts);
      result[key] = (result[key] || []).filter((item) => !deleted.has(String(item.id)))
        .map((item) => upserts.get(String(item.id)) || item);
      const existing = new Set(result[key].map((item) => String(item.id)));
      for (const [id, item] of upserts) if (!existing.has(id)) result[key].push(item);
    }
    if (patch.metadata) Object.assign(result, clone(patch.metadata));
    return result;
  }

  function conflicts(before, remote, patch) {
    const found = [];
    for (const key of collections) {
      const oldItems = byId(before[key]);
      const newItems = byId(remote[key]);
      const change = patch[key] || { upserts: [], deletes: [] };
      for (const id of [...change.upserts.map((item) => String(item.id)), ...change.deletes]) {
        if (!same(oldItems.get(id), newItems.get(id))) found.push(key + ":" + id);
      }
    }
    const remoteDaily = new Map((remote.dailyRecords || []).map((item) => [
      item.assignmentId + ":" + item.studentId + ":" + item.date, item.id
    ]));
    for (const item of patch.dailyRecords?.upserts || []) {
      const naturalKey = item.assignmentId + ":" + item.studentId + ":" + item.date;
      const existingId = remoteDaily.get(naturalKey);
      if (existingId && existingId !== item.id && !patch.dailyRecords.deletes.includes(existingId)) {
        found.push("dailyRecords:" + naturalKey);
      }
    }
    if (patch.metadata && !same(
      Object.fromEntries(metadata.map((key) => [key, before[key]])),
      Object.fromEntries(metadata.map((key) => [key, remote[key]]))
    )) found.push("metadata");
    return found;
  }

  return { collections, metadata, clone, diff, apply, conflicts };
});
