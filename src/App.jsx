import React, { useEffect, useMemo, useState } from "react";

/**
 * Workout Tracker PWA (Galaxy-first, offline, minimal taps)
 * Tabs: Today / Summary / Manage
 * Global date picker affects Today + Summary
 *
 * Key design: Baseline and Workouts are the SAME structure.
 * - "Baseline" is just a normal workout with a fixed id and name.
 * - Manage tab edits baseline and workouts through the same UI.
 *
 * Storage: localStorage (single blob) + backup key
 * Export/Import: JSON
 */

const LS_KEY = "workout_tracker_v2";
const LS_BACKUP_KEY = "workout_tracker_v2_backup";

const BASELINE_WORKOUT_ID = "baseline";

function yyyyMmDd(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function isValidDateKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function startOfWeekMonday(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = (day + 6) % 7; // Monday => 0, Sunday => 6
  d.setDate(d.getDate() - diffToMonday);
  return yyyyMmDd(d);
}

function startOfMonth(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(1);
  return yyyyMmDd(d);
}

function startOfYear(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  d.setMonth(0, 1);
  return yyyyMmDd(d);
}

function inRangeInclusive(dateKey, startKey, endKey) {
  return dateKey >= startKey && dateKey <= endKey;
}

function toNumberOrNull(weightStr) {
  if (typeof weightStr !== "string") return null;
  const t = weightStr.trim();
  if (!t) return null;
  if (t.toUpperCase() === "BW") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatMaxWeight(maxNum, hasBW) {
  if (maxNum != null) return String(maxNum);
  if (hasBW) return "BW";
  return "-";
}

function ensureBaselineWorkout(program) {
  const hasBaseline = program.workouts.some((w) => w.id === BASELINE_WORKOUT_ID);
  if (hasBaseline) return program;
  return {
    ...program,
    workouts: [
      { id: BASELINE_WORKOUT_ID, name: "Baseline", exercises: defaultBaselineExercises() },
      ...program.workouts,
    ],
  };
}

function defaultBaselineExercises() {
  return [
    { id: uid("ex"), name: "Push Ups" },
    { id: uid("ex"), name: "Pull Ups" },
    { id: uid("ex"), name: "Squats" },
    { id: uid("ex"), name: "Face Pulls" },
  ];
}

function defaultWorkouts() {
  return [
    {
      id: BASELINE_WORKOUT_ID,
      name: "Baseline",
      exercises: defaultBaselineExercises(),
    },
    {
      id: uid("w"),
      name: "Workout A",
      exercises: [
        { id: uid("ex"), name: "Incline Bench Press" },
        { id: uid("ex"), name: "Row" },
      ],
    },
    {
      id: uid("w"),
      name: "Workout B",
      exercises: [
        { id: uid("ex"), name: "Overhead Press" },
        { id: uid("ex"), name: "Pull Down" },
      ],
    },
  ];
}

function makeDefaultState() {
  return {
    version: 1,
    program: {
      workouts: defaultWorkouts(),
    },
    // logsByDate[YYYY-MM-DD][exerciseId] = { sets: [{reps, weight}], notes }
    logsByDate: {},
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return makeDefaultState();
  const st = safeParse(raw, null);
  if (!st || typeof st !== "object") return makeDefaultState();

  // minimal migration/repair
  const next = {
    ...makeDefaultState(),
    ...st,
    program: ensureBaselineWorkout(st.program ?? makeDefaultState().program),
    logsByDate: st.logsByDate && typeof st.logsByDate === "object" ? st.logsByDate : {},
    meta: { ...(st.meta ?? {}), updatedAt: Date.now() },
  };
  return next;
}

function persistState(state) {
  try {
    localStorage.setItem(LS_BACKUP_KEY, localStorage.getItem(LS_KEY) ?? "");
  } catch {
    // ignore
  }
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/* ------------------------------ UI helpers ------------------------------ */

function PillTabs({ tabs, value, onChange }) {
  return (
    <div style={styles.pillRow}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            style={{
              ...styles.pill,
              ...(active ? styles.pillActive : styles.pillInactive),
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modalSheet} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------- App --------------------------------- */

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [tab, setTab] = useState("today"); // today | summary | manage
  const [summaryMode, setSummaryMode] = useState("wtd"); // wtd | mtd | ytd
  const [dateKey, setDateKey] = useState(() => yyyyMmDd(new Date()));

  // Logging modal
  const [logOpen, setLogOpen] = useState(false);
  const [logContext, setLogContext] = useState(null); // { workoutId, exerciseId, exerciseName }
  const [draftSets, setDraftSets] = useState([]);
  const [draftNotes, setDraftNotes] = useState("");

  // Manage UI state
  const [manageWorkoutId, setManageWorkoutId] = useState(null);

  useEffect(() => {
    // keep baseline present
    setState((prev) => {
      const fixed = { ...prev, program: ensureBaselineWorkout(prev.program) };
      return fixed;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persistState({ ...state, meta: { ...(state.meta ?? {}), updatedAt: Date.now() } });
  }, [state]);

  const workouts = state.program.workouts;

  const baselineWorkout = useMemo(
    () => workouts.find((w) => w.id === BASELINE_WORKOUT_ID) ?? null,
    [workouts]
  );

  const workoutById = useMemo(() => {
    const m = new Map();
    for (const w of workouts) m.set(w.id, w);
    return m;
  }, [workouts]);

  const logsForDate = state.logsByDate[dateKey] ?? {};

  function updateState(updater) {
    setState((prev) => {
      const next = updater(deepClone(prev));
      next.meta = { ...(next.meta ?? {}), updatedAt: Date.now() };
      return next;
    });
  }

  function findMostRecentLogBefore(exerciseId, beforeDateKey) {
    const keys = Object.keys(state.logsByDate).filter((k) => isValidDateKey(k) && k < beforeDateKey);
    keys.sort((a, b) => (a > b ? -1 : 1)); // desc
    for (const k of keys) {
      const exLog = state.logsByDate[k]?.[exerciseId];
      if (exLog && Array.isArray(exLog.sets)) return exLog;
    }
    return null;
  }

  function openLog(workoutId, exercise) {
    const exerciseId = exercise.id;
    const existing = state.logsByDate[dateKey]?.[exerciseId] ?? null;
    const prior = existing ?? findMostRecentLogBefore(exerciseId, dateKey);

    const sets = prior?.sets?.length
      ? prior.sets.map((s) => ({
          reps: Number(s.reps ?? 0) || 0,
          weight: typeof s.weight === "string" ? s.weight : "",
        }))
      : [{ reps: 0, weight: "BW" }];

    const normalizedSets = sets.map((s) => {
      const isBW = String(s.weight).toUpperCase() === "BW";
      return { reps: s.reps, weight: isBW ? "BW" : String(s.weight ?? "").trim() };
    });

    setLogContext({ workoutId, exerciseId, exerciseName: exercise.name });
    setDraftSets(normalizedSets);
    setDraftNotes(prior?.notes ?? "");
    setLogOpen(true);
  }

  function saveLog() {
    if (!logContext) return;

    const cleanedSets = draftSets
      .map((s) => {
        const reps = Number(s.reps ?? 0);
        const repsClean = Number.isFinite(reps) && reps > 0 ? Math.floor(reps) : 0;
        const w = String(s.weight ?? "").trim();
        const weight = w.toUpperCase() === "BW" ? "BW" : w.replace(/[^\d.]/g, "");
        return { reps: repsClean, weight: weight || "BW" };
      })
      .filter((s) => s.reps > 0);

    updateState((st) => {
      st.logsByDate[dateKey] = st.logsByDate[dateKey] ?? {};
      st.logsByDate[dateKey][logContext.exerciseId] = {
        sets: cleanedSets.length ? cleanedSets : [{ reps: 0, weight: "BW" }],
        notes: draftNotes ?? "",
      };
      return st;
    });

    setLogOpen(false);
    setLogContext(null);
  }

  function deleteLogForExercise(exerciseId) {
    updateState((st) => {
      if (!st.logsByDate[dateKey]) return st;
      delete st.logsByDate[dateKey][exerciseId];
      return st;
    });
  }

  const summaryRange = useMemo(() => {
    if (summaryMode === "wtd") {
      return { start: startOfWeekMonday(dateKey), end: dateKey, label: "WTD" };
    }
    if (summaryMode === "mtd") {
      return { start: startOfMonth(dateKey), end: dateKey, label: "MTD" };
    }
    return { start: startOfYear(dateKey), end: dateKey, label: "YTD" };
  }, [dateKey, summaryMode]);

  function computeExerciseSummary(exerciseId, startKey, endKey) {
    let totalReps = 0;
    let maxNum = null;
    let hasBW = false;

    for (const dk of Object.keys(state.logsByDate)) {
      if (!isValidDateKey(dk)) continue;
      if (!inRangeInclusive(dk, startKey, endKey)) continue;

      const exLog = state.logsByDate[dk]?.[exerciseId];
      if (!exLog || !Array.isArray(exLog.sets)) continue;

      for (const set of exLog.sets) {
        const reps = Number(set.reps ?? 0);
        if (Number.isFinite(reps)) totalReps += reps;

        const w = String(set.weight ?? "").trim();
        if (w.toUpperCase() === "BW") {
          hasBW = true;
        } else {
          const n = toNumberOrNull(w);
          if (n != null) maxNum = maxNum == null ? n : Math.max(maxNum, n);
        }
      }
    }

    return { totalReps, maxWeight: formatMaxWeight(maxNum, hasBW) };
  }

  /* ------------------------------ Manage actions ------------------------------ */

  function addWorkout() {
    const name = prompt("Workout name:");
    if (!name) return;
    updateState((st) => {
      st.program.workouts.push({ id: uid("w"), name: name.trim(), exercises: [] });
      return st;
    });
  }

  function renameWorkout(workoutId) {
    const w = workoutById.get(workoutId);
    if (!w) return;
    const name = prompt("Rename workout:", w.name);
    if (!name) return;
    updateState((st) => {
      const ww = st.program.workouts.find((x) => x.id === workoutId);
      if (ww) ww.name = name.trim();
      return st;
    });
  }

  function deleteWorkout(workoutId) {
    if (workoutId === BASELINE_WORKOUT_ID) {
      alert("Baseline cannot be deleted.");
      return;
    }
    const w = workoutById.get(workoutId);
    if (!w) return;
    if (!confirm(`Delete workout "${w.name}"? This will NOT delete past logs.`)) return;
    updateState((st) => {
      st.program.workouts = st.program.workouts.filter((x) => x.id !== workoutId);
      return st;
    });
    if (manageWorkoutId === workoutId) setManageWorkoutId(null);
  }

  function addExercise(workoutId) {
    const name = prompt("Exercise name:");
    if (!name) return;
    updateState((st) => {
      const w = st.program.workouts.find((x) => x.id === workoutId);
      if (!w) return st;
      w.exercises.push({ id: uid("ex"), name: name.trim() });
      return st;
    });
  }

  function renameExercise(workoutId, exerciseId) {
    const w = workoutById.get(workoutId);
    const ex = w?.exercises?.find((e) => e.id === exerciseId);
    if (!ex) return;
    const name = prompt("Rename exercise:", ex.name);
    if (!name) return;
    updateState((st) => {
      const ww = st.program.workouts.find((x) => x.id === workoutId);
      const ee = ww?.exercises?.find((e) => e.id === exerciseId);
      if (ee) ee.name = name.trim();
      return st;
    });
  }

  function deleteExercise(workoutId, exerciseId) {
    const w = workoutById.get(workoutId);
    const ex = w?.exercises?.find((e) => e.id === exerciseId);
    if (!ex) return;
    if (!confirm(`Delete exercise "${ex.name}"? This will NOT delete past logs.`)) return;

    updateState((st) => {
      const ww = st.program.workouts.find((x) => x.id === workoutId);
      if (!ww) return st;
      ww.exercises = ww.exercises.filter((e) => e.id !== exerciseId);
      return st;
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workout-tracker-export-${yyyyMmDd(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJsonFromFile(file) {
    const text = await file.text();
    const incoming = safeParse(text, null);
    if (!incoming || typeof incoming !== "object") {
      alert("Invalid JSON.");
      return;
    }

    const program = incoming.program && typeof incoming.program === "object" ? incoming.program : null;
    const logsByDate =
      incoming.logsByDate && typeof incoming.logsByDate === "object" ? incoming.logsByDate : null;

    if (!program || !Array.isArray(program.workouts) || !logsByDate) {
      alert("Import file missing required fields (program.workouts, logsByDate).");
      return;
    }

    if (!confirm("Import will REPLACE your current data. Continue?")) return;

    const next = {
      ...makeDefaultState(),
      ...incoming,
      program: ensureBaselineWorkout(incoming.program),
      logsByDate,
      meta: { ...(incoming.meta ?? {}), updatedAt: Date.now() },
    };

    setState(next);
    alert("Import complete.");
  }

  /* ------------------------------ Render pieces ------------------------------ */

  function ExerciseRow({ workoutId, exercise }) {
    const exLog = logsForDate[exercise.id] ?? null;
    const hasLog = !!exLog;
    const setsText = hasLog
      ? exLog.sets
          ?.filter((s) => Number(s.reps) > 0)
          .map((s) => `${s.reps}x${String(s.weight).toUpperCase() === "BW" ? "BW" : s.weight}`)
          .join(", ")
      : "";

    return (
      <div style={styles.exerciseRow}>
        <button
          style={styles.exerciseBtn}
          onClick={() => openLog(workoutId, exercise)}
          aria-label={`Log ${exercise.name}`}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={styles.exerciseName}>{exercise.name}</div>
            {hasLog ? <span style={styles.badge}>Logged</span> : <span style={styles.badgeMuted}>-</span>}
          </div>
          {hasLog && setsText ? <div style={styles.exerciseSub}>{setsText}</div> : null}
        </button>

        {hasLog ? (
          <button
            style={styles.smallDangerBtn}
            onClick={() => deleteLogForExercise(exercise.id)}
            aria-label={`Delete log for ${exercise.name}`}
          >
            Delete
          </button>
        ) : (
          <div style={{ width: 72 }} />
        )}
      </div>
    );
  }

  function WorkoutCard({ workout }) {
    const isBaseline = workout.id === BASELINE_WORKOUT_ID;
    return (
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>{workout.name}</div>
          {isBaseline ? <span style={styles.tag}>Baseline</span> : <span style={styles.tagMuted}>Workout</span>}
        </div>

        {workout.exercises.length === 0 ? (
          <div style={styles.emptyText}>No exercises yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {workout.exercises.map((ex) => (
              <ExerciseRow key={ex.id} workoutId={workout.id} exercise={ex} />
            ))}
          </div>
        )}
      </div>
    );
  }

  function SummaryBlock({ workout }) {
    const isBaseline = workout.id === BASELINE_WORKOUT_ID;
    return (
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>{workout.name}</div>
          {isBaseline ? <span style={styles.tag}>Baseline</span> : <span style={styles.tagMuted}>Workout</span>}
        </div>

        {workout.exercises.length === 0 ? (
          <div style={styles.emptyText}>No exercises yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {workout.exercises.map((ex) => {
              const s = computeExerciseSummary(ex.id, summaryRange.start, summaryRange.end);
              return (
                <div key={ex.id} style={styles.summaryRow}>
                  <div style={{ fontWeight: 600 }}>{ex.name}</div>
                  <div style={styles.summaryRight}>
                    <span style={styles.summaryChip}>{s.totalReps} reps</span>
                    <span style={styles.summaryChip}>Max {s.maxWeight}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ Log modal UI ------------------------------ */

  const logTitle = logContext ? logContext.exerciseName : "Log";

  function toggleSetBW(i, checked) {
    setDraftSets((prev) => {
      const next = prev.map((s) => ({ ...s }));
      if (!next[i]) return prev;
      next[i].weight = checked ? "BW" : "";
      return next;
    });
  }

  function updateSet(i, field, value) {
    setDraftSets((prev) => {
      const next = prev.map((s) => ({ ...s }));
      if (!next[i]) return prev;
      next[i][field] = value;
      return next;
    });
  }

  function addSet() {
    setDraftSets((prev) => [...prev, { reps: 0, weight: "BW" }]);
  }

  function removeSet(i) {
    setDraftSets((prev) => prev.filter((_, idx) => idx !== i));
  }

  /* --------------------------------- UI --------------------------------- */

  return (
    <div style={styles.app}>
      {/* Centered column (fixes landscape) */}
      <div style={styles.content}>
        <div style={styles.topBar}>
          <div style={styles.brand}>Workout Tracker</div>
          <div style={styles.dateRow}>
            <label style={styles.label}>Date</label>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              style={styles.dateInput}
            />
          </div>
        </div>

        <div style={styles.body}>
          {tab === "today" ? (
            <div style={styles.section}>
              {baselineWorkout ? <WorkoutCard workout={baselineWorkout} /> : null}

              {workouts
                .filter((w) => w.id !== BASELINE_WORKOUT_ID)
                .map((w) => (
                  <WorkoutCard key={w.id} workout={w} />
                ))}
            </div>
          ) : null}

          {tab === "summary" ? (
            <div style={styles.section}>
              <PillTabs
                value={summaryMode}
                onChange={setSummaryMode}
                tabs={[
                  { value: "wtd", label: "WTD" },
                  { value: "mtd", label: "MTD" },
                  { value: "ytd", label: "YTD" },
                ]}
              />
              <div style={styles.rangeText}>
                Range: <b>{summaryRange.start}</b> → <b>{summaryRange.end}</b>
              </div>

              {baselineWorkout ? <SummaryBlock workout={baselineWorkout} /> : null}

              {workouts
                .filter((w) => w.id !== BASELINE_WORKOUT_ID)
                .map((w) => (
                  <SummaryBlock key={w.id} workout={w} />
                ))}
            </div>
          ) : null}

          {tab === "manage" ? (
            <div style={styles.section}>
              <div style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardTitle}>Structure</div>
                  <button style={styles.primaryBtn} onClick={addWorkout}>
                    + Add Workout
                  </button>
                </div>

                <div style={styles.manageList}>
                  {workouts.map((w) => {
                    const active = manageWorkoutId === w.id;
                    return (
                      <button
                        key={w.id}
                        style={{ ...styles.manageItem, ...(active ? styles.manageItemActive : {}) }}
                        onClick={() => setManageWorkoutId(w.id)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 700 }}>{w.name}</div>
                          {w.id === BASELINE_WORKOUT_ID ? (
                            <span style={styles.tag}>Baseline</span>
                          ) : (
                            <span style={styles.tagMuted}>Workout</span>
                          )}
                        </div>
                        <div style={styles.smallText}>{w.exercises.length} exercises</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {manageWorkoutId ? (
                <div style={styles.card}>
                  {(() => {
                    const w = workoutById.get(manageWorkoutId);
                    if (!w) return <div style={styles.emptyText}>Select a workout.</div>;
                    const isBaseline = w.id === BASELINE_WORKOUT_ID;

                    return (
                      <>
                        <div style={styles.cardHeader}>
                          <div style={styles.cardTitle}>{w.name}</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button style={styles.secondaryBtn} onClick={() => renameWorkout(w.id)}>
                              Rename
                            </button>
                            <button
                              style={styles.dangerBtn}
                              onClick={() => deleteWorkout(w.id)}
                              disabled={isBaseline}
                              title={isBaseline ? "Baseline cannot be deleted" : "Delete workout"}
                            >
                              Delete
                            </button>
                            <button style={styles.primaryBtn} onClick={() => addExercise(w.id)}>
                              + Add Exercise
                            </button>
                          </div>
                        </div>

                        {w.exercises.length === 0 ? (
                          <div style={styles.emptyText}>No exercises yet. Add one.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {w.exercises.map((ex) => (
                              <div key={ex.id} style={styles.manageExerciseRow}>
                                <div style={{ fontWeight: 700 }}>{ex.name}</div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button
                                    style={styles.secondaryBtn}
                                    onClick={() => renameExercise(w.id, ex.id)}
                                  >
                                    Rename
                                  </button>
                                  <button style={styles.dangerBtn} onClick={() => deleteExercise(w.id, ex.id)}>
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : null}

              <div style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardTitle}>Backup</div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={styles.secondaryBtn} onClick={exportJson}>
                    Export JSON
                  </button>

                  <label style={{ ...styles.secondaryBtn, cursor: "pointer" }}>
                    Import JSON
                    <input
                      type="file"
                      accept="application/json"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importJsonFromFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  <button
                    style={styles.dangerBtn}
                    onClick={() => {
                      if (!confirm("Reset ALL data? This cannot be undone.")) return;
                      setState(makeDefaultState());
                      setManageWorkoutId(null);
                      alert("Reset complete.");
                    }}
                  >
                    Reset All
                  </button>
                </div>
                <div style={styles.smallText}>
                  Import replaces current data. Structure changes never delete past logs.
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom nav stays fixed and safe-area aware */}
      <div style={styles.nav}>
        <button
          style={{ ...styles.navBtn, ...(tab === "today" ? styles.navBtnActive : {}) }}
          onClick={() => setTab("today")}
        >
          Today
        </button>
        <button
          style={{ ...styles.navBtn, ...(tab === "summary" ? styles.navBtnActive : {}) }}
          onClick={() => setTab("summary")}
        >
          Summary
        </button>
        <button
          style={{ ...styles.navBtn, ...(tab === "manage" ? styles.navBtnActive : {}) }}
          onClick={() => setTab("manage")}
        >
          Manage
        </button>
      </div>

      <Modal open={logOpen} title={logTitle} onClose={() => setLogOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={styles.smallText}>
            Prefilled from your most recent log. Edit and hit <b>Save</b>.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {draftSets.map((s, i) => {
              const isBW = String(s.weight).toUpperCase() === "BW";
              return (
                <div key={i} style={styles.setRow}>
                  <div style={styles.setIndex}>{i + 1}</div>

                  <div style={styles.fieldCol}>
                    <label style={styles.label}>Reps</label>
                    <input
                      value={String(s.reps ?? "")}
                      onChange={(e) => updateSet(i, "reps", e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      style={styles.numInput}
                      placeholder="0"
                    />
                  </div>

                  <div style={styles.fieldCol}>
                    <label style={styles.label}>Weight</label>
                    <input
                      value={isBW ? "BW" : String(s.weight ?? "")}
                      onChange={(e) => updateSet(i, "weight", e.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      style={{ ...styles.numInput, ...(isBW ? styles.disabledInput : {}) }}
                      placeholder="e.g. 185"
                      disabled={isBW}
                    />
                  </div>

                  <div style={styles.bwCol}>
                    <label style={styles.label}>BW</label>
                    <input
                      type="checkbox"
                      checked={isBW}
                      onChange={(e) => toggleSetBW(i, e.target.checked)}
                      style={styles.checkbox}
                    />
                  </div>

                  <button
                    style={styles.smallDangerBtn}
                    onClick={() => removeSet(i)}
                    disabled={draftSets.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <button style={styles.secondaryBtn} onClick={addSet}>
            + Add Set
          </button>

          <div style={styles.fieldCol}>
            <label style={styles.label}>Notes (optional)</label>
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              style={styles.textarea}
              rows={3}
              placeholder="Quick notes..."
            />
          </div>

          <div style={styles.modalFooter}>
            <button style={styles.secondaryBtn} onClick={() => setLogOpen(false)}>
              Cancel
            </button>
            <button style={styles.primaryBtn} onClick={saveLog}>
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------- Styles -------------------------------- */

const styles = {
  /* Full screen + center column to fix landscape */
  app: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "#0b0f14",
    color: "#e8eef7",
    minHeight: "100dvh",
    width: "100%",
    display: "flex",
    justifyContent: "center",
  },

  /* Centered content column */
  content: {
    width: "100%",
    maxWidth: 760, // landscape fix: no huge empty right side
    display: "flex",
    flexDirection: "column",
    paddingLeft: "calc(14px + var(--safe-left, 0px))",
    paddingRight: "calc(14px + var(--safe-right, 0px))",
    paddingTop: "calc(10px + var(--safe-top, 0px))",
    paddingBottom: "calc(92px + var(--safe-bottom, 0px))", // room for bottom nav
  },

  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "#0b0f14",
    padding: "14px 0 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },

  brand: { fontWeight: 800, fontSize: 18, letterSpacing: 0.2 },
  dateRow: { marginTop: 10, display: "flex", alignItems: "center", gap: 10 },
  label: { fontSize: 12, opacity: 0.85 },

  dateInput: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0f1722",
    color: "#e8eef7",
    fontSize: 14,
  },

  body: { flex: 1, paddingTop: 14 },
  section: { display: "flex", flexDirection: "column", gap: 12 },

  /* Bottom nav safe-area aware */
  nav: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    gap: 8,
    paddingTop: 10,
    paddingLeft: "calc(10px + var(--safe-left, 0px))",
    paddingRight: "calc(10px + var(--safe-right, 0px))",
    paddingBottom: "calc(10px + var(--safe-bottom, 0px))",
    background: "#0b0f14",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },

  navBtn: {
    flex: 1,
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#0f1722",
    color: "#e8eef7",
    fontWeight: 800,
  },

  navBtnActive: {
    border: "1px solid rgba(255,255,255,0.25)",
    background: "#152338",
  },

  card: {
    background: "#0f1722",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },

  cardTitle: { fontWeight: 900, fontSize: 16 },

  tag: {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.10)",
  },

  tagMuted: {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    opacity: 0.85,
  },

  emptyText: { opacity: 0.75, fontSize: 13, padding: "6px 2px" },

  exerciseRow: { display: "flex", alignItems: "stretch", gap: 10 },

  exerciseBtn: {
    flex: 1,
    textAlign: "left",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#0b111a",
    color: "#e8eef7",
  },

  exerciseName: { fontWeight: 800, fontSize: 15 },
  exerciseSub: { marginTop: 6, fontSize: 12, opacity: 0.8 },

  badge: {
    fontSize: 11,
    fontWeight: 800,
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(46, 204, 113, 0.18)",
    border: "1px solid rgba(46, 204, 113, 0.25)",
  },

  badgeMuted: {
    fontSize: 11,
    fontWeight: 800,
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    opacity: 0.75,
  },

  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "#152338",
    color: "#e8eef7",
    fontWeight: 900,
  },

  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b111a",
    color: "#e8eef7",
    fontWeight: 800,
  },

  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,100,100,0.35)",
    background: "rgba(255, 80, 80, 0.12)",
    color: "#ffd7d7",
    fontWeight: 900,
  },

  smallDangerBtn: {
    width: 72,
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,100,100,0.35)",
    background: "rgba(255, 80, 80, 0.12)",
    color: "#ffd7d7",
    fontWeight: 900,
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b111a",
    color: "#e8eef7",
    fontWeight: 900,
  },

  pillRow: { display: "flex", gap: 8, marginBottom: 10 },

  pill: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    fontWeight: 900,
  },

  pillActive: { background: "#152338", color: "#e8eef7", border: "1px solid rgba(255,255,255,0.20)" },
  pillInactive: { background: "#0f1722", color: "#e8eef7", opacity: 0.8 },

  rangeText: { fontSize: 12, opacity: 0.8, marginBottom: 8 },

  summaryRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#0b111a",
  },

  summaryRight: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },

  summaryChip: {
    fontSize: 12,
    fontWeight: 900,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
  },

  manageList: { display: "flex", flexDirection: "column", gap: 10 },

  manageItem: {
    textAlign: "left",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#0b111a",
    color: "#e8eef7",
  },

  manageItemActive: {
    border: "1px solid rgba(255,255,255,0.24)",
    background: "#152338",
  },

  manageExerciseRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#0b111a",
  },

  smallText: { fontSize: 12, opacity: 0.8 },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: 10,
    zIndex: 50,
  },

  modalSheet: {
    width: "100%",
    maxWidth: 720,
    background: "#0f1722",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
  },

  modalHeader: {
    padding: 12,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  modalTitle: { fontWeight: 900, fontSize: 16 },
  modalBody: { padding: 12, maxHeight: "78vh", overflow: "auto" },
  modalFooter: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 },

  setRow: {
    display: "grid",
    gridTemplateColumns: "36px 1fr 1fr 46px 88px",
    gap: 10,
    alignItems: "end",
    padding: 10,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#0b111a",
  },

  setIndex: {
    fontWeight: 900,
    opacity: 0.85,
    textAlign: "center",
    paddingBottom: 10,
  },

  fieldCol: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  bwCol: { display: "flex", flexDirection: "column", gap: 8, alignItems: "center" },

  numInput: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0f1722",
    color: "#e8eef7",
    fontSize: 14,
  },

  disabledInput: { opacity: 0.7 },
  checkbox: { width: 22, height: 22 },

  textarea: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0f1722",
    color: "#e8eef7",
    fontSize: 14,
    resize: "vertical",
  },
};
