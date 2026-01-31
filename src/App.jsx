import React, { useEffect, useMemo, useState, useRef, useReducer, useCallback } from "react";

/**
 * ============================================================================
 * WORKOUT TRACKER PWA - REFACTORED VERSION
 * ============================================================================
 * 
 * Improvements made:
 * ✅ Consolidated modal state with useReducer (15+ useState → 1 useReducer)
 * ✅ Added useCallback for performance optimization
 * ✅ Better error handling with user feedback
 * ✅ Input validation with helpful error messages
 * ✅ Improved code organization with clear sections
 * ✅ Better comments for learning
 * 
 * Structure:
 * 1. Constants
 * 2. Utility Functions
 * 3. State Management (Reducer)
 * 4. Custom Hooks
 * 5. UI Components
 * 6. Main App Component
 * 7. Styles
 */

// ============================================================================
// 1. CONSTANTS - Values that never change
// ============================================================================

const LS_KEY = "workout_tracker_v2";
const LS_BACKUP_KEY = "workout_tracker_v2_backup";
const BASELINE_WORKOUT_ID = "baseline";

const REP_UNITS = [
  // Count
  { key: "reps", label: "Reps", abbr: "reps", allowDecimal: false },
  // Distance (imperial)
  { key: "miles", label: "Miles", abbr: "mi", allowDecimal: true },
  { key: "yards", label: "Yards", abbr: "yd", allowDecimal: false },
  { key: "laps", label: "Laps", abbr: "laps", allowDecimal: false },
  { key: "steps", label: "Steps", abbr: "steps", allowDecimal: false },
  // Time
  { key: "sec", label: "Seconds", abbr: "sec", allowDecimal: true },
  { key: "min", label: "Minutes", abbr: "min", allowDecimal: true },
  { key: "hrs", label: "Hours", abbr: "hrs", allowDecimal: true },
];

function getUnit(key, exercise) {
  if (key === "custom" && exercise) {
    return {
      key: "custom",
      label: exercise.customUnitAbbr || "custom",
      abbr: exercise.customUnitAbbr || "custom",
      allowDecimal: exercise.customUnitAllowDecimal ?? false,
    };
  }
  return REP_UNITS.find((u) => u.key === key) || REP_UNITS[0];
}

// ============================================================================
// 2. UTILITY FUNCTIONS - Helper functions used throughout the app
// ============================================================================

/**
 * Converts a Date object to YYYY-MM-DD format
 */
function yyyyMmDd(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Safely parse JSON with a fallback value
 */
function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Generate a unique ID
 */
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Check if a string is a valid date key (YYYY-MM-DD)
 */
function isValidDateKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Add days to a date key
 */
function addDays(dateKey, delta) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return yyyyMmDd(d);
}

function formatDateLabel(dateKey) {
  return new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Get month key from date (YYYY-MM)
 */
function monthKeyFromDate(dateKey) {
  return dateKey.slice(0, 7);
}

/**
 * Get number of days in a month
 */
function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * Get weekday (Monday = 0, Sunday = 6)
 */
function weekdayMonday0(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  return (d.getDay() + 6) % 7;
}

/**
 * Get weekday (Sunday = 0, Saturday = 6)
 */
function weekdaySunday0(dateKey) {
  return new Date(dateKey + "T00:00:00").getDay();
}

/**
 * Shift a month key by N months
 */
function shiftMonth(monthKey, deltaMonths) {
  const [yy, mm] = monthKey.split("-").map(Number);
  const d = new Date(yy, mm - 1, 1);
  d.setMonth(d.getMonth() + deltaMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Format month for display (e.g., "January 2024")
 */
function formatMonthLabel(monthKey) {
  const [yy, mm] = monthKey.split("-").map(Number);
  const d = new Date(yy, mm - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

/**
 * Get the Monday of the week containing this date
 */
function startOfWeekMonday(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return yyyyMmDd(d);
}

/**
 * Get the Sunday of the week containing this date
 */
function startOfWeekSunday(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return yyyyMmDd(d);
}

/**
 * Get the first day of the month
 */
function startOfMonth(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(1);
  return yyyyMmDd(d);
}

/**
 * Get the first day of the year
 */
function startOfYear(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  d.setMonth(0, 1);
  return yyyyMmDd(d);
}

/**
 * Check if a date is in a range (inclusive)
 */
function inRangeInclusive(dateKey, startKey, endKey) {
  return dateKey >= startKey && dateKey <= endKey;
}

/**
 * Convert weight string to number (or null for BW)
 */
function toNumberOrNull(weightStr) {
  if (typeof weightStr !== "string") return null;
  const t = weightStr.trim();
  if (!t) return null;
  if (t.toUpperCase() === "BW") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format max weight for display
 */
function formatMaxWeight(maxNum, hasBW) {
  if (maxNum != null) return String(maxNum);
  if (hasBW) return "BW";
  return "-";
}

/**
 * Ensure baseline workout exists in program
 */
function ensureBaselineWorkout(program) {
  const hasBaseline = program.workouts.some((w) => w.id === BASELINE_WORKOUT_ID);
  if (hasBaseline) return program;
  return {
    ...program,
    workouts: [
      {
        id: BASELINE_WORKOUT_ID,
        name: "Baseline",
        category: "Baseline",
        exercises: defaultBaselineExercises(),
      },
      ...program.workouts,
    ],
  };
}

/**
 * Default baseline exercises
 */
function defaultBaselineExercises() {
  return [
    { id: uid("ex"), name: "Push Ups", unit: "reps" },
    { id: uid("ex"), name: "Pull Ups", unit: "reps" },
    { id: uid("ex"), name: "Squats", unit: "reps" },
    { id: uid("ex"), name: "Face Pulls", unit: "reps" },
  ];
}

/**
 * Default workouts for new users
 */
function defaultWorkouts() {
  return [
    {
      id: BASELINE_WORKOUT_ID,
      name: "Baseline",
      category: "Baseline",
      exercises: defaultBaselineExercises(),
    },
    {
      id: uid("w"),
      name: "Workout A",
      category: "Workout",
      exercises: [
        { id: uid("ex"), name: "Incline Bench Press", unit: "reps" },
        { id: uid("ex"), name: "Row", unit: "reps" },
      ],
    },
    {
      id: uid("w"),
      name: "Workout B",
      category: "Workout",
      exercises: [
        { id: uid("ex"), name: "Overhead Press", unit: "reps" },
        { id: uid("ex"), name: "Pull Down", unit: "reps" },
      ],
    },
  ];
}

/**
 * Create default state for new users
 */
function makeDefaultState() {
  return {
    version: 1,
    program: {
      workouts: defaultWorkouts(),
    },
    logsByDate: {},
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

/**
 * Load state from localStorage with validation
 */
function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return makeDefaultState();

  const st = safeParse(raw, null);
  if (!st || typeof st !== "object") return makeDefaultState();

  const rawProgram = st.program && typeof st.program === "object" ? st.program : {};
  const rawWorkouts = Array.isArray(rawProgram.workouts) ? rawProgram.workouts : [];

  const next = {
    ...makeDefaultState(),
    ...st,
    program: ensureBaselineWorkout({ ...rawProgram, workouts: rawWorkouts }),
    logsByDate: st.logsByDate && typeof st.logsByDate === "object" ? st.logsByDate : {},
    meta: { ...(st.meta ?? {}), updatedAt: Date.now() },
  };

  // Ensure every workout has valid structure and a category
  next.program.workouts = next.program.workouts.map((w) => ({
    ...w,
    exercises: Array.isArray(w.exercises) ? w.exercises : [],
    category:
      typeof w.category === "string" && w.category.trim()
        ? w.category.trim()
        : w.id === BASELINE_WORKOUT_ID
        ? "Baseline"
        : "Workout",
  }));

  return next;
}

/**
 * Save state to localStorage with error handling
 * 
 * IMPROVED: Now returns success/error info and notifies user
 */
function persistState(state) {
  try {
    // Step 1: Create backup of current data
    const currentData = localStorage.getItem(LS_KEY);
    if (currentData) {
      try {
        localStorage.setItem(LS_BACKUP_KEY, currentData);
      } catch (backupError) {
        console.warn("⚠️ Could not create backup:", backupError);
        // Continue anyway - backup failure shouldn't stop save
      }
    }

    // Step 2: Save new data
    localStorage.setItem(LS_KEY, JSON.stringify(state));

    return { success: true };

  } catch (error) {
    console.error("❌ Failed to save data:", error);

    // User-friendly error message
    let message = "Could not save your workout data. ";

    if (error.name === "QuotaExceededError") {
      message += "Storage is full. Try exporting and clearing old data.";
    } else {
      message += "Please try again or export your data as backup.";
    }

    return { success: false, error: message };
  }
}

/**
 * Validate exercise name
 * 
 * NEW: Returns { valid: boolean, error: string }
 */
function validateExerciseName(name, existingExercises = []) {
  const trimmed = (name || "").trim();

  if (!trimmed) {
    return { valid: false, error: "Exercise name cannot be empty" };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: "Exercise name is too long (max 50 characters)" };
  }

  const isDuplicate = existingExercises.some(
    (ex) => ex.name.toLowerCase() === trimmed.toLowerCase()
  );

  if (isDuplicate) {
    return { valid: false, error: "This exercise already exists in this workout" };
  }

  return { valid: true, error: null };
}

/**
 * Validate workout name
 */
function validateWorkoutName(name, existingWorkouts = []) {
  const trimmed = (name || "").trim();

  if (!trimmed) {
    return { valid: false, error: "Workout name cannot be empty" };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: "Workout name is too long (max 50 characters)" };
  }

  const isDuplicate = existingWorkouts.some(
    (w) => w.name.toLowerCase() === trimmed.toLowerCase()
  );

  if (isDuplicate) {
    return { valid: false, error: "A workout with this name already exists" };
  }

  return { valid: true, error: null };
}

// ============================================================================
// 3. AI COACH LOGIC - NEW IN V2!
// ============================================================================

/**
 * Muscle group classification for balance analysis
 */
const MUSCLE_GROUPS = {
  ANTERIOR_DELT: ['front delt', 'anterior delt', 'overhead press', 'military press', 'shoulder press'],
  LATERAL_DELT: ['side delt', 'lateral delt', 'lateral raise'],
  POSTERIOR_DELT: ['rear delt', 'posterior delt', 'face pull', 'reverse fly', 'reverse flye'],
  CHEST: ['chest', 'bench press', 'bench', 'push up', 'pushup', 'dip', 'fly', 'flye', 'pec'],
  TRICEPS: ['tricep', 'triceps', 'extension', 'skullcrusher', 'pushdown'],
  BACK: ['back', 'row', 'pull up', 'pullup', 'chin up', 'chinup', 'lat', 'pulldown', 'pull down', 'deadlift'],
  BICEPS: ['bicep', 'biceps', 'curl'],
  QUADS: ['quad', 'squat', 'leg press', 'lunge'],
  HAMSTRINGS: ['hamstring', 'leg curl', 'rdl', 'romanian'],
  GLUTES: ['glute', 'hip thrust'],
  CALVES: ['calf', 'calves', 'raise'],
  ABS: ['ab', 'abs', 'core', 'plank', 'crunch', 'sit up', 'situp'],
};

function classifyExercise(exerciseName) {
  const lower = exerciseName.toLowerCase();
  const matches = [];
  
  for (const [group, keywords] of Object.entries(MUSCLE_GROUPS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        matches.push(group);
        break;
      }
    }
  }
  
  return matches.length > 0 ? matches : ['UNCLASSIFIED'];
}

function analyzeWorkoutBalance(state, dateRange) {
  const muscleGroupVolume = {};
  const exerciseIdToName = new Map();
  
  for (const workout of state.program.workouts) {
    for (const ex of workout.exercises) {
      exerciseIdToName.set(ex.id, ex.name);
    }
  }
  
  for (const dateKey of Object.keys(state.logsByDate || {})) {
    if (!isValidDateKey(dateKey)) continue;
    if (!inRangeInclusive(dateKey, dateRange.start, dateRange.end)) continue;

    const dayLogs = state.logsByDate[dateKey];
    if (!dayLogs || typeof dayLogs !== "object") continue;

    for (const [exerciseId, log] of Object.entries(dayLogs)) {
      const exerciseName = exerciseIdToName.get(exerciseId);
      if (!exerciseName) continue;
      if (!log || !Array.isArray(log.sets)) continue;

      const groups = classifyExercise(exerciseName);
      const totalReps = log.sets.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
      
      for (const group of groups) {
        muscleGroupVolume[group] = (muscleGroupVolume[group] || 0) + totalReps;
      }
    }
  }
  
  return { muscleGroupVolume };
}

function getSuggestionsForMuscleGroup(group) {
  const suggestions = {
    POSTERIOR_DELT: [
      { exercise: 'Face Pulls', muscleGroup: 'POSTERIOR_DELT' },
      { exercise: 'Reverse Flyes', muscleGroup: 'POSTERIOR_DELT' },
    ],
    BACK: [
      { exercise: 'Pull Ups', muscleGroup: 'BACK' },
      { exercise: 'Barbell Rows', muscleGroup: 'BACK' },
      { exercise: 'Lat Pulldowns', muscleGroup: 'BACK' },
    ],
    BICEPS: [
      { exercise: 'Barbell Curls', muscleGroup: 'BICEPS' },
      { exercise: 'Hammer Curls', muscleGroup: 'BICEPS' },
    ],
    HAMSTRINGS: [
      { exercise: 'Romanian Deadlifts', muscleGroup: 'HAMSTRINGS' },
      { exercise: 'Leg Curls', muscleGroup: 'HAMSTRINGS' },
    ],
  };
  
  return suggestions[group] || [];
}

function detectImbalances(analysis) {
  const insights = [];
  const muscleGroupVolume = analysis?.muscleGroupVolume ?? {};

  const totalVolume = Object.values(muscleGroupVolume).reduce((a, b) => a + b, 0);
  
  if (totalVolume < 50) return [];
  
  // Check push/pull ratio
  const pushVolume = 
    (muscleGroupVolume.CHEST || 0) + 
    (muscleGroupVolume.ANTERIOR_DELT || 0) + 
    (muscleGroupVolume.TRICEPS || 0);
    
  const pullVolume = 
    (muscleGroupVolume.BACK || 0) + 
    (muscleGroupVolume.POSTERIOR_DELT || 0) + 
    (muscleGroupVolume.BICEPS || 0);
  
  if (pushVolume > pullVolume * 1.5 && pullVolume > 0) {
    const ratio = (pushVolume / pullVolume).toFixed(1);
    insights.push({
      type: 'IMBALANCE',
      severity: 'HIGH',
      title: '⚠️ Push/Pull Imbalance Detected',
      message: `You're doing ${ratio}x more pushing than pulling. This can lead to shoulder issues and poor posture.`,
      suggestions: [
        { exercise: 'Barbell Rows', muscleGroup: 'BACK' },
        { exercise: 'Pull Ups', muscleGroup: 'BACK' },
        { exercise: 'Face Pulls', muscleGroup: 'POSTERIOR_DELT' },
      ]
    });
  }
  
  // Check posterior delt neglect
  const anteriorDelt = muscleGroupVolume.ANTERIOR_DELT || 0;
  const posteriorDelt = muscleGroupVolume.POSTERIOR_DELT || 0;
  
  if (anteriorDelt > posteriorDelt * 2 && anteriorDelt > 30) {
    insights.push({
      type: 'IMBALANCE',
      severity: 'MEDIUM',
      title: '💡 Rear Delt Neglect',
      message: 'Your front delts are getting way more work than rear delts. Add rear delt work for balanced shoulders.',
      suggestions: getSuggestionsForMuscleGroup('POSTERIOR_DELT')
    });
  }
  
  // Check neglected groups
  const importantGroups = ['BACK', 'HAMSTRINGS', 'POSTERIOR_DELT'];
  
  for (const group of importantGroups) {
    const volume = muscleGroupVolume[group] || 0;
    const percentage = (volume / totalVolume) * 100;
    
    if (percentage < 5 && totalVolume > 100 && insights.length < 2) {
      const groupName = group.replace(/_/g, ' ').toLowerCase();
      insights.push({
        type: 'NEGLECTED',
        severity: 'LOW',
        title: `📊 ${groupName} volume is low`,
        message: `You've barely trained ${groupName} recently. Consider adding some direct work.`,
        suggestions: getSuggestionsForMuscleGroup(group)
      });
    }
  }
  
  // Positive feedback
  if (insights.length === 0 && totalVolume > 100) {
    insights.push({
      type: 'POSITIVE',
      severity: 'INFO',
      title: '✅ Training looks balanced!',
      message: 'Your workout volume is well-distributed. Keep up the great work!',
      suggestions: []
    });
  }
  
  return insights.slice(0, 3);
}

// ============================================================================
// 4. STATE MANAGEMENT - Modal Reducer
// ============================================================================

/**
 * Initial state for all modals
 * 
 * IMPROVEMENT: All modal state in one place instead of 15+ useState calls
 */
const initialModalState = {
  log: {
    isOpen: false,
    context: null, // { workoutId, exerciseId, exerciseName }
    sets: [],
    notes: "",
  },
  confirm: {
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Delete",
    onConfirm: null,
  },
  input: {
    isOpen: false,
    title: "",
    label: "",
    placeholder: "",
    value: "",
    confirmText: "Save",
    onConfirm: null,
  },
  datePicker: {
    isOpen: false,
    monthCursor: "",
  },
  addWorkout: {
    isOpen: false,
    name: "",
    category: "Workout",
  },
  addExercise: {
    isOpen: false,
    workoutId: null,
    name: "",
    unit: "reps",
    customUnitAbbr: "",
    customUnitAllowDecimal: false,
  },
  // NEW: Modal for adding suggested exercises from AI Coach
  addSuggestion: {
    isOpen: false,
    exerciseName: "",
  },
  editUnit: {
    isOpen: false,
    workoutId: null,
    exerciseId: null,
    unit: "reps",
    customUnitAbbr: "",
    customUnitAllowDecimal: false,
  },
};

/**
 * Modal reducer - handles all modal actions
 * 
 * Think of this as a command center that receives "actions" (commands)
 * and updates the state accordingly
 */
function modalReducer(state, action) {
  switch (action.type) {
    // ===== LOG MODAL =====
    case "OPEN_LOG":
      return {
        ...state,
        log: {
          isOpen: true,
          context: action.payload.context,
          sets: action.payload.sets,
          notes: action.payload.notes,
        },
      };

    case "UPDATE_LOG_SETS":
      return {
        ...state,
        log: { ...state.log, sets: action.payload },
      };

    case "UPDATE_LOG_NOTES":
      return {
        ...state,
        log: { ...state.log, notes: action.payload },
      };

    case "CLOSE_LOG":
      return {
        ...state,
        log: initialModalState.log,
      };

    // ===== CONFIRM MODAL =====
    case "OPEN_CONFIRM":
      return {
        ...state,
        confirm: {
          isOpen: true,
          title: action.payload.title,
          message: action.payload.message,
          confirmText: action.payload.confirmText || "Delete",
          onConfirm: action.payload.onConfirm,
        },
      };

    case "CLOSE_CONFIRM":
      return {
        ...state,
        confirm: initialModalState.confirm,
      };

    // ===== INPUT MODAL =====
    case "OPEN_INPUT":
      return {
        ...state,
        input: {
          isOpen: true,
          title: action.payload.title,
          label: action.payload.label,
          placeholder: action.payload.placeholder,
          value: action.payload.initialValue || "",
          confirmText: action.payload.confirmText || "Save",
          onConfirm: action.payload.onConfirm,
        },
      };

    case "UPDATE_INPUT_VALUE":
      return {
        ...state,
        input: { ...state.input, value: action.payload },
      };

    case "CLOSE_INPUT":
      return {
        ...state,
        input: initialModalState.input,
      };

    // ===== DATE PICKER =====
    case "OPEN_DATE_PICKER":
      return {
        ...state,
        datePicker: {
          isOpen: true,
          monthCursor: action.payload.monthCursor,
        },
      };

    case "UPDATE_MONTH_CURSOR":
      return {
        ...state,
        datePicker: { ...state.datePicker, monthCursor: action.payload },
      };

    case "CLOSE_DATE_PICKER":
      return {
        ...state,
        datePicker: { ...state.datePicker, isOpen: false },
      };

    // ===== ADD WORKOUT MODAL =====
    case "OPEN_ADD_WORKOUT":
      return {
        ...state,
        addWorkout: {
          isOpen: true,
          name: "",
          category: "Workout",
        },
      };

    case "UPDATE_ADD_WORKOUT":
      return {
        ...state,
        addWorkout: { ...state.addWorkout, ...action.payload },
      };

    case "CLOSE_ADD_WORKOUT":
      return {
        ...state,
        addWorkout: initialModalState.addWorkout,
      };

    // ===== ADD EXERCISE MODAL =====
    case "OPEN_ADD_EXERCISE":
      return {
        ...state,
        addExercise: {
          isOpen: true,
          workoutId: action.payload.workoutId,
          name: "",
          unit: "reps",
          customUnitAbbr: "",
          customUnitAllowDecimal: false,
        },
      };

    case "UPDATE_ADD_EXERCISE":
      return {
        ...state,
        addExercise: { ...state.addExercise, ...action.payload },
      };

    case "CLOSE_ADD_EXERCISE":
      return {
        ...state,
        addExercise: initialModalState.addExercise,
      };

    // NEW: Add suggestion modal actions
    case "OPEN_ADD_SUGGESTION":
      return {
        ...state,
        addSuggestion: {
          isOpen: true,
          exerciseName: action.payload.exerciseName,
        },
      };

    case "CLOSE_ADD_SUGGESTION":
      return {
        ...state,
        addSuggestion: initialModalState.addSuggestion,
      };

    // ===== EDIT UNIT MODAL =====
    case "OPEN_EDIT_UNIT":
      return {
        ...state,
        editUnit: {
          isOpen: true,
          workoutId: action.payload.workoutId,
          exerciseId: action.payload.exerciseId,
          unit: action.payload.unit,
          customUnitAbbr: action.payload.customUnitAbbr || "",
          customUnitAllowDecimal: action.payload.customUnitAllowDecimal ?? false,
        },
      };

    case "UPDATE_EDIT_UNIT":
      return {
        ...state,
        editUnit: { ...state.editUnit, ...action.payload },
      };

    case "CLOSE_EDIT_UNIT":
      return {
        ...state,
        editUnit: initialModalState.editUnit,
      };

    default:
      return state;
  }
}

// ============================================================================
// 4. CUSTOM HOOKS - Reusable logic
// ============================================================================

/**
 * Custom hook for swipe gestures
 * 
 * Usage: const swipe = useSwipe({ onSwipeLeft: fn, onSwipeRight: fn });
 *        <div {...swipe}>Content</div>
 */
function useSwipe({ onSwipeLeft, onSwipeRight, thresholdPx = 40 }) {
  const startXRef = useRef(null);

  function onTouchStart(e) {
    const x = e.touches?.[0]?.clientX;
    if (typeof x === "number") startXRef.current = x;
  }

  function onTouchEnd(e) {
    const startX = startXRef.current;
    startXRef.current = null;
    const endX = e.changedTouches?.[0]?.clientX;
    if (typeof startX !== "number" || typeof endX !== "number") return;

    const dx = endX - startX;
    if (Math.abs(dx) < thresholdPx) return;

    if (dx < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  }

  return { onTouchStart, onTouchEnd };
}

// ============================================================================
// 5. UI COMPONENTS - Reusable UI pieces
// ============================================================================

/**
 * Pill-style tabs component
 */
function PillTabs({ tabs, value, onChange, styles }) {
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

/**
 * Modal component - reusable sheet-style modal
 */
function Modal({ open, title, children, onClose, styles }) {
  if (!open) return null;

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modalSheet} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Close">
            ×
          </button>
        </div>
        <div style={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Confirmation modal
 */
function ConfirmModal({ open, title, message, confirmText = "Delete", onCancel, onConfirm, styles }) {
  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onCancel} styles={styles}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={styles.smallText}>{message}</div>
        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.dangerBtn} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Input modal
 */
function InputModal({
  open,
  title,
  label,
  placeholder,
  value = "",
  confirmText = "Save",
  onCancel,
  onConfirm,
  onChange,
  styles,
}) {
  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onCancel} styles={styles}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={styles.fieldCol}>
          <label style={styles.label}>{label}</label>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={styles.textInput}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.primaryBtn} onClick={() => onConfirm(value)}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Theme switch component
 */
function ThemeSwitch({ theme, onToggle, styles }) {
  const isDark = theme === "dark";

  return (
    <button
      onClick={onToggle}
      style={{
        ...styles.themeSwitch,
        ...(isDark ? styles.themeSwitchDark : styles.themeSwitchLight),
      }}
      aria-label="Toggle theme"
      type="button"
    >
      <span
        style={{
          ...styles.themeSwitchTrack,
          ...(isDark ? styles.themeSwitchTrackDark : styles.themeSwitchTrackLight),
        }}
      >
        <span style={{ ...styles.themeSwitchIcon, left: 6, opacity: isDark ? 0.35 : 0.9 }}>☀️</span>
        <span style={{ ...styles.themeSwitchIcon, right: 6, opacity: isDark ? 0.9 : 0.35 }}>🌙</span>
        <span
          style={{
            ...styles.themeSwitchThumb,
            ...(isDark ? styles.themeSwitchThumbDark : styles.themeSwitchThumbLight),
            transform: isDark ? "translateX(22px)" : "translateX(0px)",
          }}
        />
      </span>
      <span style={styles.themeSwitchLabel}>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}

/**
 * NEW: AI Coach Insights Card
 */
function CoachInsightsCard({ insights, onAddExercise, styles }) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  
  if (insights.length === 0) return null;
  
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitle}>🤖 AI Coach</div>
        <span style={styles.badge}>
          {insights.length} insight{insights.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {insights.map((insight, idx) => (
          <InsightItem
            key={idx}
            insight={insight}
            isExpanded={expandedIndex === idx}
            onToggle={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
            onAddExercise={onAddExercise}
            styles={styles}
          />
        ))}
      </div>
      
      <div style={styles.coachFooter}>
        💡 <b>Tip:</b> Click an insight to see exercise suggestions
      </div>
    </div>
  );
}

function InsightItem({ insight, isExpanded, onToggle, onAddExercise, styles }) {
  const severityColors = {
    HIGH: '#ef4444',
    MEDIUM: '#f59e0b',
    LOW: '#3b82f6',
    INFO: '#10b981',
  };
  
  return (
    <div style={{
      ...styles.insightCard,
      borderLeft: `4px solid ${severityColors[insight.severity]}`
    }}>
      <button 
        onClick={onToggle}
        style={styles.insightHeader}
        type="button"
      >
        <div style={{ flex: 1 }}>
          <div style={styles.insightTitle}>{insight.title}</div>
          <div style={styles.insightMessage}>{insight.message}</div>
        </div>
        {insight.suggestions.length > 0 && (
          <span style={styles.insightChevron}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
      </button>
      
      {isExpanded && insight.suggestions.length > 0 && (
        <div style={styles.insightSuggestions}>
          <div style={styles.suggestionsTitle}>💪 Suggested exercises:</div>
          {insight.suggestions.map((suggestion, i) => (
            <div key={i} style={styles.suggestionRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.suggestionName}>{suggestion.exercise}</div>
                <div style={styles.suggestionGroup}>
                  {suggestion.muscleGroup.replace(/_/g, ' ').toLowerCase()}
                </div>
              </div>
              <button
                onClick={() => onAddExercise(suggestion.exercise)}
                style={styles.addSuggestionBtn}
                type="button"
              >
                + Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * NEW: Modal for selecting workout to add suggested exercise to
 */
function AddSuggestedExerciseModal({ open, exerciseName, workouts, onCancel, onConfirm, styles }) {
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(workouts[0]?.id || null);
  
  useEffect(() => {
    if (open && workouts.length > 0) {
      setSelectedWorkoutId(workouts[0].id);
    }
  }, [open, workouts]);
  
  if (!open) return null;
  
  return (
    <Modal open={open} title={`Add "${exerciseName}"`} onClose={onCancel} styles={styles}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={styles.fieldCol}>
          <label style={styles.label}>Add to which workout?</label>
          <select
            value={selectedWorkoutId || ''}
            onChange={(e) => setSelectedWorkoutId(e.target.value)}
            style={styles.textInput}
          >
            {workouts.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.category})
              </option>
            ))}
          </select>
        </div>
        
        <div style={styles.smallText}>
          💡 This will add <b>"{exerciseName}"</b> to your selected workout. You can rename or remove it later.
        </div>
        
        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
          <button 
            style={styles.primaryBtn} 
            onClick={() => onConfirm(selectedWorkoutId, exerciseName)}
            disabled={!selectedWorkoutId}
          >
            Add Exercise
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// 6. MAIN APP COMPONENT
// ============================================================================

export default function App() {
  // ---------------------------------------------------------------------------
  // STATE - What the app remembers
  // ---------------------------------------------------------------------------

  const [state, setState] = useState(() => loadState());
  const [tab, setTab] = useState("today");
  const [summaryMode, setSummaryMode] = useState("wtd");
  const [dateKey, setDateKey] = useState(() => yyyyMmDd(new Date()));
  const [manageWorkoutId, setManageWorkoutId] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("wt_theme") || "dark");
  const [reorderMode, setReorderMode] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);

  // IMPROVEMENT: All modal state consolidated into one reducer
  const [modals, dispatchModal] = useReducer(modalReducer, {
    ...initialModalState,
    datePicker: {
      ...initialModalState.datePicker,
      monthCursor: monthKeyFromDate(dateKey),
    },
  });

  const todayKey = yyyyMmDd(new Date());

  // ---------------------------------------------------------------------------
  // COMPUTED VALUES - Derived from state
  // ---------------------------------------------------------------------------

  const colors = useMemo(
    () =>
      theme === "dark"
        ? {
            appBg: "#0b0f14",
            text: "#e8eef7",
            border: "rgba(255,255,255,0.10)",
            cardBg: "#0f1722",
            cardAltBg: "#0b111a",
            inputBg: "#0f1722",
            navBg: "#0b0f14",
            topBarBg: "#0b0f14",
            shadow: "0 8px 18px rgba(0,0,0,0.25)",
            primaryBg: "#152338",
            primaryText: "#e8eef7",
            dangerBg: "rgba(255, 80, 80, 0.14)",
            dangerBorder: "rgba(255, 120, 120, 0.45)",
            dangerText: "#ffd7d7",
            dot: "#7dd3fc",
          }
        : {
            appBg: "#f5f9fc",
            text: "#1f2933",
            border: "#dde5ec",
            cardBg: "#ffffff",
            cardAltBg: "#eef6f3",
            inputBg: "#ffffff",
            navBg: "#f5f9fc",
            topBarBg: "#f5f9fc",
            shadow: "0 8px 18px rgba(31,41,51,0.08)",
            primaryBg: "#2b5b7a",
            primaryText: "#ffffff",
            dangerBg: "rgba(220, 38, 38, 0.12)",
            dangerBorder: "rgba(220, 38, 38, 0.35)",
            dangerText: "#b91c1c",
            dot: "#2563eb",
          },
    [theme]
  );

  const styles = useMemo(() => getStyles(colors), [colors]);

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

  const summaryRange = useMemo(() => {
    if (summaryMode === "wtd") {
      return { start: startOfWeekSunday(dateKey), end: dateKey, label: "WTD" };
    }
    if (summaryMode === "mtd") {
      return { start: startOfMonth(dateKey), end: dateKey, label: "MTD" };
    }
    return { start: startOfYear(dateKey), end: dateKey, label: "YTD" };
  }, [dateKey, summaryMode]);

  const loggedDaysInMonth = useMemo(() => {
    const set = new Set();
    const prefix = modals.datePicker.monthCursor + "-";

    for (const dk of Object.keys(state.logsByDate || {})) {
      if (!isValidDateKey(dk)) continue;
      if (!dk.startsWith(prefix)) continue;

      const dayLogs = state.logsByDate[dk];
      if (dayLogs && typeof dayLogs === "object" && Object.keys(dayLogs).length > 0) {
        set.add(dk);
      }
    }
    return set;
  }, [state.logsByDate, modals.datePicker.monthCursor]);

  // NEW: AI Coach insights computation
  const coachInsights = useMemo(() => {
    const analysis = analyzeWorkoutBalance(state, summaryRange);
    return detectImbalances(analysis);
  }, [state, summaryRange]);

  // ---------------------------------------------------------------------------
  // EFFECTS - Side effects (saving, syncing)
  // ---------------------------------------------------------------------------

  // Keep calendar month aligned with selected date
  useEffect(() => {
    dispatchModal({
      type: "UPDATE_MONTH_CURSOR",
      payload: monthKeyFromDate(dateKey),
    });
  }, [dateKey]);

  // Save theme preference
  useEffect(() => {
    localStorage.setItem("wt_theme", theme);
  }, [theme]);

  // Close overflow menu when switching workouts
  useEffect(() => {
    setOverflowMenuOpen(false);
  }, [manageWorkoutId]);

  // Ensure baseline workout exists
  useEffect(() => {
    setState((prev) => {
      const hasBaseline = prev.program.workouts.some((w) => w.id === BASELINE_WORKOUT_ID);
      if (hasBaseline) return prev;
      return { ...prev, program: ensureBaselineWorkout(prev.program) };
    });
  }, []);

  // Persist state changes
  useEffect(() => {
    const result = persistState({
      ...state,
      meta: { ...(state.meta ?? {}), updatedAt: Date.now() },
    });

    // IMPROVEMENT: Show error to user if save failed
    if (!result.success) {
      console.error(result.error);
      // In production, you'd show a toast notification here
    }
  }, [state]);

  // ---------------------------------------------------------------------------
  // HELPER FUNCTIONS
  // ---------------------------------------------------------------------------

  /**
   * Update app state
   */
  function updateState(updater) {
    setState((prev) => {
      const next = updater(structuredClone(prev));
      next.meta = { ...(next.meta ?? {}), updatedAt: Date.now() };
      return next;
    });
  }

  /**
   * Find most recent log for an exercise before a date
   */
  function findMostRecentLogBefore(exerciseId, beforeDateKey) {
    const keys = Object.keys(state.logsByDate).filter(
      (k) => isValidDateKey(k) && k < beforeDateKey
    );
    keys.sort((a, b) => (a > b ? -1 : 1));
    for (const k of keys) {
      const exLog = state.logsByDate[k]?.[exerciseId];
      if (exLog && Array.isArray(exLog.sets)) return exLog;
    }
    return null;
  }

  /**
   * Compute summary stats for an exercise
   */
  function computeExerciseSummary(exerciseId, startKey, endKey, unit) {
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

    const displayTotal = unit?.allowDecimal
      ? parseFloat(totalReps.toFixed(2))
      : Math.floor(totalReps);

    return { totalReps: displayTotal, maxWeight: formatMaxWeight(maxNum, hasBW) };
  }

  // ---------------------------------------------------------------------------
  // EVENT HANDLERS - IMPROVEMENT: Wrapped in useCallback for performance
  // ---------------------------------------------------------------------------

  /**
   * Open log modal for an exercise
   */
  const openLog = useCallback(
    (workoutId, exercise) => {
      const exerciseId = exercise.id;
      const existing = state.logsByDate[dateKey]?.[exerciseId] ?? null;
      const prior = existing ?? findMostRecentLogBefore(exerciseId, dateKey);

      const sets = prior?.sets?.length
        ? prior.sets.map((s) => ({
            reps: Number(s.reps ?? 0) || 0,
            weight: typeof s.weight === "string" ? s.weight : "",
          }))
        : [{ reps: 0, weight: "" }];

      const normalizedSets = sets.map((s) => {
        const isBW = String(s.weight).toUpperCase() === "BW";
        return { reps: s.reps, weight: isBW ? "BW" : String(s.weight ?? "").trim() };
      });

      dispatchModal({
        type: "OPEN_LOG",
        payload: {
          context: {
            workoutId,
            exerciseId,
            exerciseName: exercise.name,
            unit: exercise.unit || "reps",
            customUnitAbbr: exercise.customUnitAbbr || "",
            customUnitAllowDecimal: exercise.customUnitAllowDecimal ?? false,
          },
          sets: normalizedSets,
          notes: prior?.notes ?? "",
        },
      });
    },
    [state.logsByDate, dateKey]
  );

  /**
   * Save the current log
   */
  const saveLog = useCallback(() => {
    if (!modals.log.context) return;

    const logCtx = modals.log.context;

    updateState((st) => {
      // Look up exercise from program for current unit
      let logExercise = null;
      for (const wk of st.program.workouts) {
        const found = wk.exercises.find((e) => e.id === logCtx.exerciseId);
        if (found) { logExercise = found; break; }
      }
      const logUnit = logExercise ? getUnit(logExercise.unit, logExercise) : getUnit("reps");

      const cleanedSets = (Array.isArray(modals.log.sets) ? modals.log.sets : [])
        .map((s) => {
          const reps = Number(s.reps ?? 0);
          const repsClean = Number.isFinite(reps) && reps > 0
            ? (logUnit.allowDecimal ? parseFloat(reps.toFixed(2)) : Math.floor(reps))
            : 0;
          const w = String(s.weight ?? "").trim();
          const weight = w.toUpperCase() === "BW" ? "BW" : w.replace(/[^\d.]/g, "");
          return { reps: repsClean, weight: weight || "" };
        })
        .filter((s) => s.reps > 0);

      // Save the log entry (no unit persistence — units are managed in Manage tab)
      st.logsByDate[dateKey] = st.logsByDate[dateKey] ?? {};
      st.logsByDate[dateKey][logCtx.exerciseId] = {
        sets: cleanedSets.length ? cleanedSets : [{ reps: 0, weight: "BW" }],
        notes: modals.log.notes ?? "",
      };

      return st;
    });

    dispatchModal({ type: "CLOSE_LOG" });
  }, [modals.log, dateKey]);

  /**
   * Delete log for an exercise
   */
  const deleteLogForExercise = useCallback(
    (exerciseId) => {
      updateState((st) => {
        if (!st.logsByDate[dateKey]) return st;
        delete st.logsByDate[dateKey][exerciseId];
        return st;
      });
    },
    [dateKey]
  );

  /**
   * Add a new workout
   */
  function addWorkout() {
    dispatchModal({ type: "OPEN_ADD_WORKOUT" });
  }

  /**
   * Rename a workout
   */
  const renameWorkout = useCallback(
    (workoutId) => {
      const w = workoutById.get(workoutId);
      if (!w) return;

      dispatchModal({
        type: "OPEN_INPUT",
        payload: {
          title: "Rename workout",
          label: "Workout name",
          placeholder: "e.g. Push Day",
          initialValue: w.name,
          onConfirm: (val) => {
            // IMPROVEMENT: Validate input
            const validation = validateWorkoutName(val, workouts.filter((x) => x.id !== workoutId));
            if (!validation.valid) {
              alert("⚠️ " + validation.error);
              return;
            }

            const name = val.trim();
            updateState((st) => {
              const ww = st.program.workouts.find((x) => x.id === workoutId);
              if (ww) ww.name = name;
              return st;
            });
            dispatchModal({ type: "CLOSE_INPUT" });
          },
        },
      });
    },
    [workoutById, workouts]
  );

  /**
   * Set workout category
   */
  const setWorkoutCategory = useCallback(
    (workoutId) => {
      const w = workoutById.get(workoutId);
      if (!w) return;

      dispatchModal({
        type: "OPEN_INPUT",
        payload: {
          title: "Set category",
          label: "Workout category",
          placeholder: "e.g. Push / Pull / Legs / Stretch",
          initialValue: (w.category || "Workout").trim(),
          onConfirm: (val) => {
            const next = (val || "").trim() || "Workout";
            updateState((st) => {
              const ww = st.program.workouts.find((x) => x.id === workoutId);
              if (ww) ww.category = next;
              return st;
            });
            dispatchModal({ type: "CLOSE_INPUT" });
          },
        },
      });
    },
    [workoutById]
  );

  /**
   * Delete a workout
   */
  const deleteWorkout = useCallback(
    (workoutId) => {
      if (workoutId === BASELINE_WORKOUT_ID) {
        alert("Baseline cannot be deleted.");
        return;
      }
      const w = workoutById.get(workoutId);
      if (!w) return;

      dispatchModal({
        type: "OPEN_CONFIRM",
        payload: {
          title: "Delete workout?",
          message: `Delete ${w.name}? This will NOT delete past logs.`,
          confirmText: "Delete",
          onConfirm: () => {
            updateState((st) => {
              st.program.workouts = st.program.workouts.filter((x) => x.id !== workoutId);
              return st;
            });
            if (manageWorkoutId === workoutId) setManageWorkoutId(null);
            dispatchModal({ type: "CLOSE_CONFIRM" });
          },
        },
      });
    },
    [workoutById, manageWorkoutId]
  );

  /**
   * Add an exercise to a workout
   */
  const addExercise = useCallback(
    (workoutId) => {
      const workout = workoutById.get(workoutId);
      if (!workout) return;

      dispatchModal({
        type: "OPEN_ADD_EXERCISE",
        payload: { workoutId },
      });
    },
    [workoutById]
  );

  /**
   * Rename an exercise
   */
  const renameExercise = useCallback(
    (workoutId, exerciseId) => {
      const w = workoutById.get(workoutId);
      const ex = w?.exercises?.find((e) => e.id === exerciseId);
      if (!ex) return;

      dispatchModal({
        type: "OPEN_INPUT",
        payload: {
          title: "Rename exercise",
          label: "Exercise name",
          placeholder: "e.g. Bench Press",
          initialValue: ex.name,
          onConfirm: (val) => {
            // IMPROVEMENT: Validate input
            const otherExercises = w.exercises.filter((e) => e.id !== exerciseId);
            const validation = validateExerciseName(val, otherExercises);
            if (!validation.valid) {
              alert("⚠️ " + validation.error);
              return;
            }

            const name = val.trim();
            updateState((st) => {
              const ww = st.program.workouts.find((x) => x.id === workoutId);
              const ee = ww?.exercises?.find((e) => e.id === exerciseId);
              if (ee) ee.name = name;
              return st;
            });
            dispatchModal({ type: "CLOSE_INPUT" });
          },
        },
      });
    },
    [workoutById]
  );

  /**
   * Delete an exercise
   */
  const deleteExercise = useCallback(
    (workoutId, exerciseId) => {
      const w = workoutById.get(workoutId);
      const ex = w?.exercises?.find((e) => e.id === exerciseId);
      if (!ex) return;

      dispatchModal({
        type: "OPEN_CONFIRM",
        payload: {
          title: "Delete exercise?",
          message: `Delete "${ex.name}"? This will NOT delete past logs.`,
          confirmText: "Delete",
          onConfirm: () => {
            updateState((st) => {
              const ww = st.program.workouts.find((x) => x.id === workoutId);
              if (!ww) return st;
              ww.exercises = ww.exercises.filter((e) => e.id !== exerciseId);
              return st;
            });
            dispatchModal({ type: "CLOSE_CONFIRM" });
          },
        },
      });
    },
    [workoutById]
  );

  /**
   * Edit unit for an exercise (from Manage tab)
   */
  const editUnitExercise = useCallback(
    (workoutId, exerciseId) => {
      const w = workoutById.get(workoutId);
      const ex = w?.exercises?.find((e) => e.id === exerciseId);
      if (!ex) return;

      dispatchModal({
        type: "OPEN_EDIT_UNIT",
        payload: {
          workoutId,
          exerciseId,
          unit: ex.unit || "reps",
          customUnitAbbr: ex.customUnitAbbr || "",
          customUnitAllowDecimal: ex.customUnitAllowDecimal ?? false,
        },
      });
    },
    [workoutById]
  );

  const saveEditUnit = useCallback(() => {
    const { workoutId, exerciseId, unit, customUnitAbbr, customUnitAllowDecimal } = modals.editUnit;

    if (unit === "custom" && !customUnitAbbr?.trim()) {
      alert("\u26a0\ufe0f Please enter a custom unit abbreviation");
      return;
    }

    updateState((st) => {
      const w = st.program.workouts.find((x) => x.id === workoutId);
      const ex = w?.exercises?.find((e) => e.id === exerciseId);
      if (!ex) return st;
      ex.unit = unit;
      if (unit === "custom") {
        ex.customUnitAbbr = customUnitAbbr.trim();
        ex.customUnitAllowDecimal = customUnitAllowDecimal ?? false;
      } else {
        delete ex.customUnitAbbr;
        delete ex.customUnitAllowDecimal;
      }
      return st;
    });

    dispatchModal({ type: "CLOSE_EDIT_UNIT" });
  }, [modals.editUnit]);

  /**
   * Move a workout up or down in the list (skips baseline)
   */
  function moveWorkout(workoutId, direction) {
    updateState((st) => {
      const arr = st.program.workouts;
      const idx = arr.findIndex((w) => w.id === workoutId);
      if (idx < 0) return st;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= arr.length) return st;
      // Don't swap with baseline
      if (arr[targetIdx].id === BASELINE_WORKOUT_ID) return st;
      [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
      return st;
    });
  }

  /**
   * Move an exercise up or down within a workout
   */
  function moveExercise(workoutId, exerciseId, direction) {
    updateState((st) => {
      const w = st.program.workouts.find((x) => x.id === workoutId);
      if (!w) return st;
      const arr = w.exercises;
      const idx = arr.findIndex((e) => e.id === exerciseId);
      if (idx < 0) return st;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= arr.length) return st;
      [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
      return st;
    });
  }

  /**
   * Export data as JSON
   */
  const exportJson = useCallback(() => {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `workout-tracker-export-${yyyyMmDd(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("❌ Failed to export data: " + error.message);
    }
  }, [state]);

  /**
   * Import data from JSON file
   */
  async function importJsonFromFile(file) {
    try {
      const text = await file.text();
      const incoming = safeParse(text, null);

      if (!incoming || typeof incoming !== "object") {
        alert("❌ Invalid JSON file.");
        return;
      }

      const program = incoming.program && typeof incoming.program === "object" ? incoming.program : null;
      const logsByDate = incoming.logsByDate && typeof incoming.logsByDate === "object" ? incoming.logsByDate : null;

      if (!program || !Array.isArray(program.workouts) || !logsByDate) {
        alert("❌ Import file missing required fields (program.workouts, logsByDate).");
        return;
      }

      if (!confirm("⚠️ Import will REPLACE your current data. Continue?")) return;

      const next = {
        ...makeDefaultState(),
        ...incoming,
        program: ensureBaselineWorkout(incoming.program),
        logsByDate,
        meta: { ...(incoming.meta ?? {}), updatedAt: Date.now() },
      };

      setState(next);
      alert("✅ Import complete!");
    } catch (error) {
      alert("❌ Failed to import: " + error.message);
    }
  }

  // NEW: Handle adding suggested exercise from AI Coach
  function handleAddSuggestion(exerciseName) {
    dispatchModal({
      type: "OPEN_ADD_SUGGESTION",
      payload: { exerciseName },
    });
  }

  const confirmAddSuggestion = useCallback((workoutId, exerciseName) => {
    const workout = workoutById.get(workoutId);
    if (!workout) {
      alert("❌ Workout not found");
      return;
    }
    
    // Check if exercise already exists
    const exists = workout.exercises.some(
      ex => ex.name.toLowerCase() === exerciseName.toLowerCase()
    );
    
    if (exists) {
      alert(`"${exerciseName}" already exists in ${workout.name}`);
      dispatchModal({ type: "CLOSE_ADD_SUGGESTION" });
      return;
    }
    
    // Add the exercise
    updateState((st) => {
      const w = st.program.workouts.find((x) => x.id === workoutId);
      if (!w) return st;
      w.exercises.push({ id: uid("ex"), name: exerciseName, unit: "reps" });
      return st;
    });

    dispatchModal({ type: "CLOSE_ADD_SUGGESTION" });
    alert(`✅ Added "${exerciseName}" to ${workout.name}!`);
  }, [workoutById]);

  // Swipe hook for calendar
  const swipe = useSwipe({
    onSwipeLeft: () =>
      dispatchModal({
        type: "UPDATE_MONTH_CURSOR",
        payload: shiftMonth(modals.datePicker.monthCursor, +1),
      }),
    onSwipeRight: () =>
      dispatchModal({
        type: "UPDATE_MONTH_CURSOR",
        payload: shiftMonth(modals.datePicker.monthCursor, -1),
      }),
  });

  // ---------------------------------------------------------------------------
  // SUB-COMPONENTS - Components that need access to app state/handlers
  // ---------------------------------------------------------------------------

  /**
   * Exercise row component
   */
  function ExerciseRow({ workoutId, exercise }) {
    const exLog = logsForDate[exercise.id] ?? null;
    const hasLog = !!exLog && Array.isArray(exLog.sets);
    const exUnit = getUnit(exercise.unit, exercise);
    const setsText = hasLog
      ? exLog.sets
          .filter((s) => Number(s.reps) > 0)
          .map((s) => {
            const isBW = String(s.weight).toUpperCase() === "BW";
            const w = isBW ? "BW" : s.weight;
            if (exUnit.key === "reps") {
              return `${s.reps}x${w}`;
            }
            const hasWeight = w && w !== "BW" && w !== "" && w !== "0";
            return hasWeight ? `${s.reps}${exUnit.abbr} @ ${w}` : `${s.reps}${exUnit.abbr}`;
          })
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
            <span style={styles.unitPill}>{exUnit.abbr}</span>
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

  /**
   * Workout card component
   */
  function WorkoutCard({ workout }) {
    const cat = (workout.category || "Workout").trim();
    return (
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>{workout.name}</div>
          <span style={styles.tagMuted}>{cat}</span>
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

  /**
   * Summary block component
   */
  function SummaryBlock({ workout }) {
    const cat = (workout.category || "Workout").trim();
    return (
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>{workout.name}</div>
          <span style={styles.tagMuted}>{cat}</span>
        </div>

        {workout.exercises.length === 0 ? (
          <div style={styles.emptyText}>No exercises yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {workout.exercises.map((ex) => {
              const exUnit = getUnit(ex.unit, ex);
              const s = computeExerciseSummary(ex.id, summaryRange.start, summaryRange.end, exUnit);
              return (
                <div key={ex.id} style={styles.summaryRow}>
                  <div style={{ fontWeight: 600 }}>{ex.name}</div>
                  <div style={styles.summaryRight}>
                    <span style={styles.summaryChip}>{s.totalReps} {exUnit.abbr}</span>
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

  // ---------------------------------------------------------------------------
  // RENDER - The actual UI
  // ---------------------------------------------------------------------------

  return (
    <div style={styles.app}>
      {/* Main content column */}
      <div style={styles.content}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <div style={styles.topBarRow}>
            <div style={styles.brand}>Workout Tracker</div>
            <ThemeSwitch theme={theme} styles={styles} onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
          </div>

          <div style={styles.dateRow}>
            <label style={styles.label}>Date</label>

            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <button
                style={styles.secondaryBtn}
                onClick={() => setDateKey((k) => addDays(k, -1))}
                aria-label="Previous day"
                type="button"
              >
                ←
              </button>

              <button
                style={{ ...styles.dateBtn, flex: 1 }}
                onClick={() =>
                  dispatchModal({
                    type: "OPEN_DATE_PICKER",
                    payload: { monthCursor: monthKeyFromDate(dateKey) },
                  })
                }
                aria-label="Pick date"
                type="button"
              >
                {formatDateLabel(dateKey)}
              </button>

              <button
                style={styles.secondaryBtn}
                onClick={() => setDateKey((k) => addDays(k, +1))}
                aria-label="Next day"
                type="button"
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* Main body */}
        <div style={styles.body}>
          {/* TODAY TAB */}
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

          {/* SUMMARY TAB */}
          {tab === "summary" ? (
            <div style={styles.section}>
              {/* AI Coach Card */}
              <CoachInsightsCard
                insights={coachInsights}
                onAddExercise={handleAddSuggestion}
                styles={styles}
              />

              <PillTabs
                styles={styles}
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

          {/* MANAGE TAB */}
          {tab === "manage" ? (
            <div style={styles.section}>
              {/* Workout list */}
              <div style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardTitle}>Structure</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      style={reorderMode ? styles.primaryBtn : styles.secondaryBtn}
                      onClick={() => setReorderMode((v) => !v)}
                    >
                      {reorderMode ? "Done" : "Reorder"}
                    </button>
                    <button style={styles.primaryBtn} onClick={addWorkout}>
                      + Add Workout
                    </button>
                  </div>
                </div>

                <div style={styles.manageList}>
                  {workouts.map((w, wi) => {
                    const active = manageWorkoutId === w.id;
                    const isBase = w.id === BASELINE_WORKOUT_ID;
                    const isFirst = wi === 0 || (wi === 1 && workouts[0]?.id === BASELINE_WORKOUT_ID);
                    const isLast = wi === workouts.length - 1;
                    return (
                      <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          style={{ ...styles.manageItem, flex: 1, ...(active ? styles.manageItemActive : {}) }}
                          onClick={() => setManageWorkoutId(w.id)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontWeight: 700 }}>{w.name}</div>
                            <span style={styles.tagMuted}>{(w.category || "Workout").trim()}</span>
                          </div>
                          <div style={styles.smallText}>{w.exercises.length} exercises</div>
                        </button>
                        {reorderMode && !isBase ? (
                          <div style={styles.reorderBtnGroup}>
                            <button
                              style={styles.reorderBtn}
                              disabled={isFirst}
                              onClick={() => moveWorkout(w.id, -1)}
                              title="Move up"
                            >&#9650;</button>
                            <button
                              style={styles.reorderBtn}
                              disabled={isLast}
                              onClick={() => moveWorkout(w.id, 1)}
                              title="Move down"
                            >&#9660;</button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected workout editor */}
              {manageWorkoutId ? (
                <div style={styles.card}>
                  {(() => {
                    const w = workoutById.get(manageWorkoutId);
                    if (!w) return <div style={styles.emptyText}>Select a workout.</div>;
                    const isBaseline = w.id === BASELINE_WORKOUT_ID;

                    return (
                      <>
                        {/* Workout header: title+tag left, overflow menu right */}
                        <div style={styles.cardHeader}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                            <div style={{ ...styles.cardTitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</div>
                            <span style={styles.tagMuted}>{(w.category || "Workout").trim()}</span>
                          </div>
                          <div style={{ position: "relative" }}>
                            <button
                              style={styles.overflowMenuBtn}
                              onClick={() => setOverflowMenuOpen((v) => !v)}
                              title="More options"
                            >&#8942;</button>
                            {overflowMenuOpen ? (
                              <>
                                <div style={styles.overflowBackdrop} onClick={() => setOverflowMenuOpen(false)} />
                                <div style={styles.overflowMenu}>
                                  <button
                                    style={styles.overflowMenuItem}
                                    onClick={() => { setOverflowMenuOpen(false); renameWorkout(w.id); }}
                                  >Rename workout</button>
                                  <button
                                    style={styles.overflowMenuItem}
                                    onClick={() => { setOverflowMenuOpen(false); setWorkoutCategory(w.id); }}
                                  >Change category</button>
                                  {!isBaseline ? (
                                    <button
                                      style={styles.overflowMenuItemDanger}
                                      onClick={() => { setOverflowMenuOpen(false); deleteWorkout(w.id); }}
                                    >Delete workout</button>
                                  ) : null}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {/* Full-width add exercise button */}
                        <button style={styles.addExerciseFullBtn} onClick={() => addExercise(w.id)}>
                          + Add Exercise
                        </button>

                        {w.exercises.length === 0 ? (
                          <div style={styles.emptyText}>No exercises yet. Add one above.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {w.exercises.map((ex, ei) => {
                              const isFirstEx = ei === 0;
                              const isLastEx = ei === w.exercises.length - 1;
                              return (
                                <div key={ex.id} style={styles.manageExerciseRow}>
                                  <div style={styles.manageExerciseLeft}>
                                    <div style={styles.manageExerciseName}>{ex.name}</div>
                                    <span style={styles.unitPill}>{getUnit(ex.unit, ex).abbr}</span>
                                  </div>
                                  {reorderMode ? (
                                    <div style={styles.reorderBtnGroup}>
                                      <button
                                        style={styles.reorderBtn}
                                        disabled={isFirstEx}
                                        onClick={() => moveExercise(w.id, ex.id, -1)}
                                        title="Move up"
                                      >&#9650;</button>
                                      <button
                                        style={styles.reorderBtn}
                                        disabled={isLastEx}
                                        onClick={() => moveExercise(w.id, ex.id, 1)}
                                        title="Move down"
                                      >&#9660;</button>
                                    </div>
                                  ) : (
                                    <div style={styles.manageExerciseActions}>
                                      <button style={styles.compactSecondaryBtn} onClick={() => editUnitExercise(w.id, ex.id)}>
                                        Unit
                                      </button>
                                      <button style={styles.compactSecondaryBtn} onClick={() => renameExercise(w.id, ex.id)}>
                                        Rename
                                      </button>
                                      <button style={styles.compactDangerBtn} onClick={() => deleteExercise(w.id, ex.id)}>
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : null}

              {/* Backup section */}
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
                      if (!confirm("⚠️ Reset ALL data? This cannot be undone.")) return;
                      setState(makeDefaultState());
                      setManageWorkoutId(null);
                      alert("✅ Reset complete.");
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

      {/* Bottom navigation */}
      <div style={styles.nav}>
        <button style={{ ...styles.navBtn, ...(tab === "today" ? styles.navBtnActive : {}) }} onClick={() => setTab("today")}>
          Today
        </button>
        <button style={{ ...styles.navBtn, ...(tab === "summary" ? styles.navBtnActive : {}) }} onClick={() => setTab("summary")}>
          Summary
        </button>
        <button style={{ ...styles.navBtn, ...(tab === "manage" ? styles.navBtnActive : {}) }} onClick={() => setTab("manage")}>
          Manage
        </button>
      </div>

      {/* MODALS */}

      {/* Log Modal */}
      <Modal open={modals.log.isOpen} title={modals.log.context?.exerciseName || "Log"} onClose={() => dispatchModal({ type: "CLOSE_LOG" })} styles={styles}>
        {modals.log.isOpen && (() => {
          const logCtx = modals.log.context;
          // Look up exercise from program for current unit
          let logExercise = null;
          for (const wk of state.program.workouts) {
            const found = wk.exercises.find((e) => e.id === logCtx?.exerciseId);
            if (found) { logExercise = found; break; }
          }
          const logUnit = logExercise ? getUnit(logExercise.unit, logExercise) : getUnit("reps");
          return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={styles.smallText}>
            Prefilled from your most recent log. Unit: <b>{logUnit.label}</b> — change in Manage tab.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {modals.log.sets.map((s, i) => {
              const isBW = String(s.weight).toUpperCase() === "BW";
              return (
                <div key={i} style={styles.setRow}>
                  <div style={styles.setIndex}>{i + 1}</div>

                  <div style={styles.fieldCol}>
                    <label style={styles.label}>{logUnit.label}</label>
                    <input
                      value={String(s.reps ?? "")}
                      onChange={(e) => {
                        const newSets = [...modals.log.sets];
                        const regex = logUnit.allowDecimal ? /[^\d.]/g : /[^\d]/g;
                        newSets[i] = { ...newSets[i], reps: e.target.value.replace(regex, "") };
                        dispatchModal({ type: "UPDATE_LOG_SETS", payload: newSets });
                      }}
                      inputMode={logUnit.allowDecimal ? "decimal" : "numeric"}
                      pattern={logUnit.allowDecimal ? "[0-9.]*" : "[0-9]*"}
                      style={styles.numInput}
                      placeholder="0"
                    />
                  </div>

                  <div style={styles.fieldCol}>
                    <label style={styles.label}>Weight</label>
                    <input
                      value={isBW ? "BW" : String(s.weight ?? "")}
                      onChange={(e) => {
                        const newSets = [...modals.log.sets];
                        newSets[i] = { ...newSets[i], weight: e.target.value };
                        dispatchModal({ type: "UPDATE_LOG_SETS", payload: newSets });
                      }}
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
                      onChange={(e) => {
                        const newSets = [...modals.log.sets];
                        newSets[i] = { ...newSets[i], weight: e.target.checked ? "BW" : "" };
                        dispatchModal({ type: "UPDATE_LOG_SETS", payload: newSets });
                      }}
                      style={styles.checkbox}
                    />
                  </div>

                  <button
                    style={styles.smallDangerBtn}
                    onClick={() => {
                      const newSets = modals.log.sets.filter((_, idx) => idx !== i);
                      dispatchModal({ type: "UPDATE_LOG_SETS", payload: newSets });
                    }}
                    disabled={modals.log.sets.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <button
            style={styles.secondaryBtn}
            onClick={() => {
              const last = modals.log.sets[modals.log.sets.length - 1];
              const nextSet = last ? { reps: last.reps ?? 0, weight: last.weight ?? "" } : { reps: 0, weight: "" };
              dispatchModal({ type: "UPDATE_LOG_SETS", payload: [...modals.log.sets, nextSet] });
            }}
          >
            + Add Set
          </button>

          <div style={styles.fieldCol}>
            <label style={styles.label}>Notes (optional)</label>
            <textarea
              value={modals.log.notes}
              onChange={(e) => dispatchModal({ type: "UPDATE_LOG_NOTES", payload: e.target.value })}
              style={styles.textarea}
              rows={3}
              placeholder="Quick notes..."
            />
          </div>

          <div style={styles.modalFooter}>
            <button style={styles.secondaryBtn} onClick={() => dispatchModal({ type: "CLOSE_LOG" })}>
              Cancel
            </button>
            <button style={styles.primaryBtn} onClick={saveLog}>
              Save
            </button>
          </div>
        </div>
          );
        })()}
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        open={modals.datePicker.isOpen}
        title="Pick a date"
        onClose={() => dispatchModal({ type: "CLOSE_DATE_PICKER" })}
        styles={styles}
      >
        {(() => {
          const [yy, mm] = modals.datePicker.monthCursor.split("-").map(Number);
          const year = yy;
          const monthIndex0 = mm - 1;

          const firstDayKey = `${modals.datePicker.monthCursor}-01`;
          const padLeft = weekdaySunday0(firstDayKey);
          const dim = daysInMonth(year, monthIndex0);

          const cells = [];
          for (let i = 0; i < padLeft; i++) cells.push(null);
          for (let d = 1; d <= dim; d++) cells.push(d);
          while (cells.length % 7 !== 0) cells.push(null);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Month header */}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <button
                  style={styles.secondaryBtn}
                  onClick={() =>
                    dispatchModal({
                      type: "UPDATE_MONTH_CURSOR",
                      payload: shiftMonth(modals.datePicker.monthCursor, -1),
                    })
                  }
                  type="button"
                >
                  Prev
                </button>

                <div style={{ fontWeight: 900, alignSelf: "center" }}>{formatMonthLabel(modals.datePicker.monthCursor)}</div>

                <button
                  style={styles.secondaryBtn}
                  onClick={() =>
                    dispatchModal({
                      type: "UPDATE_MONTH_CURSOR",
                      payload: shiftMonth(modals.datePicker.monthCursor, +1),
                    })
                  }
                  type="button"
                >
                  Next
                </button>
              </div>

              {/* Calendar grid */}
              <div {...swipe} style={styles.calendarSwipeArea}>
                <div style={styles.calendarGrid}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
                    <div key={w} style={styles.calendarDow}>
                      {w}
                    </div>
                  ))}

                  {cells.map((day, idx) => {
                    if (!day) return <div key={idx} />;

                    const dayKey = `${modals.datePicker.monthCursor}-${String(day).padStart(2, "0")}`;
                    const selected = dayKey === dateKey;
                    const hasLog = loggedDaysInMonth.has(dayKey);
                    const isToday = dayKey === todayKey;

                    return (
                      <button
                        key={idx}
                        style={{
                          ...styles.calendarCell,
                          ...(isToday && !selected ? styles.calendarCellToday : {}),
                          ...(selected ? styles.calendarCellActive : {}),
                        }}
                        onClick={() => {
                          setDateKey(dayKey);
                          dispatchModal({ type: "CLOSE_DATE_PICKER" });
                        }}
                        type="button"
                      >
                        <div style={styles.calendarCellNum}>{day}</div>
                        <div style={{ height: 10, display: "flex", justifyContent: "center" }}>
                          {hasLog && !selected ? <span style={styles.calendarDot} /> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button style={styles.secondaryBtn} onClick={() => dispatchModal({ type: "CLOSE_DATE_PICKER" })} type="button">
                  Close
                </button>
                <button
                  style={styles.primaryBtn}
                  onClick={() => {
                    setDateKey(yyyyMmDd(new Date()));
                    dispatchModal({ type: "CLOSE_DATE_PICKER" });
                  }}
                  type="button"
                >
                  Today
                </button>
              </div>

              <div style={styles.smallText}>Tip: swipe left/right to change months. Dots = days with logs.</div>
            </div>
          );
        })()}
      </Modal>

      {/* Confirm Modal */}
      <ConfirmModal
        open={modals.confirm.isOpen}
        title={modals.confirm.title}
        message={modals.confirm.message}
        confirmText={modals.confirm.confirmText}
        onCancel={() => dispatchModal({ type: "CLOSE_CONFIRM" })}
        onConfirm={modals.confirm.onConfirm}
        styles={styles}
      />

      {/* Input Modal */}
      <InputModal
        open={modals.input.isOpen}
        title={modals.input.title}
        label={modals.input.label}
        placeholder={modals.input.placeholder}
        value={modals.input.value}
        confirmText={modals.input.confirmText}
        onCancel={() => dispatchModal({ type: "CLOSE_INPUT" })}
        onConfirm={modals.input.onConfirm}
        onChange={(val) => dispatchModal({ type: "UPDATE_INPUT_VALUE", payload: val })}
        styles={styles}
      />

      {/* Add Workout Modal */}
      <Modal
        open={modals.addWorkout.isOpen}
        title="Add Workout"
        onClose={() => dispatchModal({ type: "CLOSE_ADD_WORKOUT" })}
        styles={styles}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={styles.fieldCol}>
            <label style={styles.label}>Workout name</label>
            <input
              value={modals.addWorkout.name}
              onChange={(e) =>
                dispatchModal({
                  type: "UPDATE_ADD_WORKOUT",
                  payload: { name: e.target.value },
                })
              }
              style={styles.textInput}
              placeholder="e.g. Workout C"
              autoFocus
            />
          </div>

          <div style={styles.fieldCol}>
            <label style={styles.label}>Workout category</label>
            <input
              value={modals.addWorkout.category}
              onChange={(e) =>
                dispatchModal({
                  type: "UPDATE_ADD_WORKOUT",
                  payload: { category: e.target.value },
                })
              }
              style={styles.textInput}
              placeholder="e.g. Push / Pull / Legs / Stretch"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              <option value="Workout" />
              <option value="Baseline" />
              <option value="Push" />
              <option value="Pull" />
              <option value="Legs" />
              <option value="Upper" />
              <option value="Lower" />
              <option value="Cardio" />
              <option value="Stretch" />
              <option value="Abs" />
              <option value="Custom" />
            </datalist>
          </div>

          <div style={styles.modalFooter}>
            <button style={styles.secondaryBtn} onClick={() => dispatchModal({ type: "CLOSE_ADD_WORKOUT" })}>
              Cancel
            </button>
            <button
              style={styles.primaryBtn}
              onClick={() => {
                // IMPROVEMENT: Validate input
                const validation = validateWorkoutName(modals.addWorkout.name, workouts);
                if (!validation.valid) {
                  alert("⚠️ " + validation.error);
                  return;
                }

                const name = modals.addWorkout.name.trim();
                const category = (modals.addWorkout.category || "Workout").trim() || "Workout";
                const newId = uid("w");

                updateState((st) => {
                  st.program.workouts.push({
                    id: newId,
                    name,
                    category,
                    exercises: [],
                  });
                  return st;
                });

                dispatchModal({ type: "CLOSE_ADD_WORKOUT" });
                setManageWorkoutId(newId);
                setTab("manage");
              }}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Exercise Modal */}
      <Modal
        open={modals.addExercise.isOpen}
        title="Add Exercise"
        onClose={() => dispatchModal({ type: "CLOSE_ADD_EXERCISE" })}
        styles={styles}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={styles.fieldCol}>
            <label style={styles.label}>Exercise name</label>
            <input
              value={modals.addExercise.name}
              onChange={(e) =>
                dispatchModal({
                  type: "UPDATE_ADD_EXERCISE",
                  payload: { name: e.target.value },
                })
              }
              style={styles.textInput}
              placeholder="e.g. Bench Press"
              autoFocus
            />
          </div>

          <div style={styles.fieldCol}>
            <label style={styles.label}>Unit</label>
            <select
              value={modals.addExercise.unit}
              onChange={(e) =>
                dispatchModal({
                  type: "UPDATE_ADD_EXERCISE",
                  payload: { unit: e.target.value },
                })
              }
              style={styles.textInput}
            >
              {REP_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label} ({u.abbr})
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>

          {modals.addExercise.unit === "custom" && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ ...styles.fieldCol, flex: 1 }}>
                <label style={styles.label}>Abbreviation</label>
                <input
                  value={modals.addExercise.customUnitAbbr || ""}
                  onChange={(e) =>
                    dispatchModal({
                      type: "UPDATE_ADD_EXERCISE",
                      payload: { customUnitAbbr: e.target.value.slice(0, 10) },
                    })
                  }
                  style={styles.textInput}
                  placeholder="e.g. cal"
                />
              </div>
              <div style={{ ...styles.fieldCol, alignItems: "center" }}>
                <label style={styles.label}>Decimals</label>
                <input
                  type="checkbox"
                  checked={modals.addExercise.customUnitAllowDecimal || false}
                  onChange={(e) =>
                    dispatchModal({
                      type: "UPDATE_ADD_EXERCISE",
                      payload: { customUnitAllowDecimal: e.target.checked },
                    })
                  }
                  style={styles.checkbox}
                />
              </div>
            </div>
          )}

          <div style={styles.modalFooter}>
            <button style={styles.secondaryBtn} onClick={() => dispatchModal({ type: "CLOSE_ADD_EXERCISE" })}>
              Cancel
            </button>
            <button
              style={styles.primaryBtn}
              onClick={() => {
                const workout = workoutById.get(modals.addExercise.workoutId);
                if (!workout) return;

                const validation = validateExerciseName(modals.addExercise.name, workout.exercises);
                if (!validation.valid) {
                  alert("\u26a0\ufe0f " + validation.error);
                  return;
                }

                if (modals.addExercise.unit === "custom" && !modals.addExercise.customUnitAbbr?.trim()) {
                  alert("\u26a0\ufe0f Please enter a custom unit abbreviation");
                  return;
                }

                const name = modals.addExercise.name.trim();
                const unit = modals.addExercise.unit;
                const wId = modals.addExercise.workoutId;
                updateState((st) => {
                  const w = st.program.workouts.find((x) => x.id === wId);
                  if (!w) return st;
                  const newEx = { id: uid("ex"), name, unit };
                  if (unit === "custom") {
                    newEx.customUnitAbbr = modals.addExercise.customUnitAbbr.trim();
                    newEx.customUnitAllowDecimal = modals.addExercise.customUnitAllowDecimal ?? false;
                  }
                  w.exercises.push(newEx);
                  return st;
                });
                dispatchModal({ type: "CLOSE_ADD_EXERCISE" });
              }}
            >
              Add
            </button>
          </div>
        </div>
      </Modal>

      {/* NEW: Add Suggested Exercise Modal */}
      <AddSuggestedExerciseModal
        open={modals.addSuggestion.isOpen}
        exerciseName={modals.addSuggestion.exerciseName}
        workouts={workouts.filter(w => w.id !== BASELINE_WORKOUT_ID)}
        onCancel={() => dispatchModal({ type: "CLOSE_ADD_SUGGESTION" })}
        onConfirm={confirmAddSuggestion}
        styles={styles}
      />

      {/* Edit Unit Modal */}
      <Modal
        open={modals.editUnit.isOpen}
        title="Change Unit"
        onClose={() => dispatchModal({ type: "CLOSE_EDIT_UNIT" })}
        styles={styles}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={styles.fieldCol}>
            <label style={styles.label}>Unit</label>
            <select
              value={modals.editUnit.unit}
              onChange={(e) =>
                dispatchModal({
                  type: "UPDATE_EDIT_UNIT",
                  payload: { unit: e.target.value },
                })
              }
              style={styles.textInput}
            >
              {REP_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label} ({u.abbr})
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>

          {modals.editUnit.unit === "custom" && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ ...styles.fieldCol, flex: 1 }}>
                <label style={styles.label}>Abbreviation</label>
                <input
                  value={modals.editUnit.customUnitAbbr || ""}
                  onChange={(e) =>
                    dispatchModal({
                      type: "UPDATE_EDIT_UNIT",
                      payload: { customUnitAbbr: e.target.value.slice(0, 10) },
                    })
                  }
                  style={styles.textInput}
                  placeholder="e.g. cal"
                />
              </div>
              <div style={{ ...styles.fieldCol, alignItems: "center" }}>
                <label style={styles.label}>Decimals</label>
                <input
                  type="checkbox"
                  checked={modals.editUnit.customUnitAllowDecimal || false}
                  onChange={(e) =>
                    dispatchModal({
                      type: "UPDATE_EDIT_UNIT",
                      payload: { customUnitAllowDecimal: e.target.checked },
                    })
                  }
                  style={styles.checkbox}
                />
              </div>
            </div>
          )}

          <div style={styles.modalFooter}>
            <button style={styles.secondaryBtn} onClick={() => dispatchModal({ type: "CLOSE_EDIT_UNIT" })}>
              Cancel
            </button>
            <button style={styles.primaryBtn} onClick={saveEditUnit}>
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// 7. STYLES - All styling in one place
// ============================================================================

function getStyles(colors) {
  return {
    app: {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      background: colors.appBg,
      color: colors.text,
      minHeight: "100dvh",
      width: "100%",
      display: "flex",
      justifyContent: "center",
    },

    content: {
      width: "100%",
      maxWidth: 760,
      display: "flex",
      flexDirection: "column",
      paddingLeft: "calc(14px + var(--safe-left, 0px))",
      paddingRight: "calc(14px + var(--safe-right, 0px))",
      paddingTop: "calc(10px + var(--safe-top, 0px))",
      paddingBottom: "calc(92px + var(--safe-bottom, 0px))",
    },

    topBar: {
      position: "sticky",
      top: 0,
      zIndex: 10,
      background: colors.topBarBg,
      padding: "14px 0 10px",
      borderBottom: `1px solid ${colors.border}`,
    },

    brand: { fontWeight: 800, fontSize: 18, letterSpacing: 0.2 },
    dateRow: { marginTop: 10, display: "flex", alignItems: "center", gap: 10 },
    label: { fontSize: 12, opacity: 0.85 },

    topBarRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },

    textInput: {
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.inputBg,
      color: colors.text,
      fontSize: 14,
      width: "100%",
      boxSizing: "border-box",
    },

    dateBtn: {
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.inputBg,
      color: colors.text,
      fontSize: 14,
      fontWeight: 900,
      textAlign: "center",
    },

    body: { flex: 1, paddingTop: 14 },
    section: { display: "flex", flexDirection: "column", gap: 12 },

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
      background: colors.navBg,
      borderTop: `1px solid ${colors.border}`,
    },

    navBtn: {
      flex: 1,
      padding: "12px 12px",
      borderRadius: 14,
      border: `1px solid ${colors.border}`,
      background: colors.cardBg,
      color: colors.text,
      fontWeight: 800,
    },

    navBtnActive: {
      border: "1px solid rgba(255,255,255,0.25)",
      background: colors.primaryBg,
      color: colors.primaryText,
    },

    card: {
      background: colors.cardBg,
      border: `1px solid ${colors.border}`,
      borderRadius: 16,
      padding: 12,
      boxShadow: colors.shadow,
    },

    cardHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 10,
    },

    cardTitle: { fontWeight: 900, fontSize: 16 },

    tagMuted: {
      fontSize: 12,
      padding: "4px 8px",
      borderRadius: 999,
      background: colors.appBg === "#0b0f14" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      border: `1px solid ${colors.border}`,
      opacity: 0.85,
    },

    emptyText: { opacity: 0.75, fontSize: 13, padding: "6px 2px" },

    exerciseRow: { display: "flex", alignItems: "stretch", gap: 10 },

    exerciseBtn: {
      flex: 1,
      textAlign: "left",
      padding: 12,
      borderRadius: 14,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
      color: colors.text,
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

    unitPill: {
      fontSize: 11,
      fontWeight: 800,
      padding: "2px 7px",
      borderRadius: 999,
      background: colors.appBg === "#0b0f14" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      border: `1px solid ${colors.border}`,
      opacity: 0.85,
    },

    primaryBtn: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      background: colors.primaryBg,
      color: colors.primaryText,
      fontWeight: 900,
    },

    secondaryBtn: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: colors.cardAltBg,
      color: colors.text,
      fontWeight: 800,
    },

    dangerBtn: {
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${colors.dangerBorder}`,
      background: colors.dangerBg,
      color: colors.dangerText,
      fontWeight: 900,
    },

    smallDangerBtn: {
      width: 72,
      height: 40,
      padding: 0,
      borderRadius: 12,
      border: `1px solid ${colors.dangerBorder}`,
      background: colors.dangerBg,
      color: colors.dangerText,
      fontWeight: 900,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: "40px",
      alignSelf: "center",
    },

    manageList: { display: "flex", flexDirection: "column", gap: 10 },

    manageItem: {
      textAlign: "left",
      padding: 12,
      borderRadius: 14,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
      color: colors.text,
    },

    manageItemActive: {
      border: `1px solid ${colors.border}`,
      background: colors.primaryBg,
      color: colors.primaryText,
    },

    manageExerciseRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 14,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
      overflow: "hidden",
    },

    manageExerciseLeft: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
      flex: 1,
    },

    manageExerciseName: {
      fontWeight: 700,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },

    manageExerciseActions: {
      display: "flex",
      gap: 4,
      flexShrink: 0,
    },

    pillRow: { display: "flex", gap: 8, marginBottom: 10 },

    pill: {
      flex: 1,
      padding: "10px 12px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.10)",
      fontWeight: 900,
    },

    pillActive: {
      background: colors.primaryBg,
      color: colors.primaryText,
      border: `1px solid ${colors.border}`,
    },

    pillInactive: {
      background: colors.cardAltBg,
      color: colors.text,
      opacity: 0.85,
      border: `1px solid ${colors.border}`,
    },

    rangeText: { fontSize: 12, opacity: 0.8, marginBottom: 8 },

    summaryRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 14,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
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
      background: colors.cardBg,
      border: `1px solid ${colors.border}`,
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

    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
      color: colors.text,
      fontWeight: 900,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      lineHeight: "40px",
      fontSize: 20,
    },

    setRow: {
      display: "grid",
      gridTemplateColumns: "36px 1fr 1fr 46px 88px",
      gap: 10,
      alignItems: "center",
      padding: 10,
      borderRadius: 14,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
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
      border: `1px solid ${colors.border}`,
      background: colors.inputBg,
      color: colors.text,
      fontSize: 14,
    },

    disabledInput: { opacity: 0.7 },
    checkbox: { width: 22, height: 22 },

    textarea: {
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.inputBg,
      color: colors.text,
      fontSize: 14,
      resize: "vertical",
    },

    calendarSwipeArea: {
      borderRadius: 14,
      touchAction: "pan-y",
    },

    calendarGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: 8,
    },

    calendarDow: {
      fontSize: 11,
      fontWeight: 800,
      opacity: 0.75,
      textAlign: "center",
      padding: "4px 0",
    },

    calendarCell: {
      padding: "10px 0 6px",
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
      color: colors.text,
      fontWeight: 900,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
    },

    calendarCellActive: {
      background: colors.primaryBg,
      color: colors.primaryText,
      border: `1px solid ${colors.border}`,
    },

    calendarCellNum: {
      lineHeight: "18px",
    },

    calendarDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      background: colors.dot,
      opacity: 1,
      boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
    },

    calendarCellToday: {
      boxShadow: `0 0 0 2px ${colors.primaryBg} inset`,
    },

    themeSwitch: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 999,
      border: `1px solid ${colors.border}`,
      background: colors.cardBg,
      color: colors.text,
      fontWeight: 800,
      boxShadow: colors.shadow,
      userSelect: "none",
      WebkitTapHighlightColor: "transparent",
    },

    themeSwitchDark: {},
    themeSwitchLight: {},

    themeSwitchTrack: {
      width: 44,
      height: 24,
      borderRadius: 999,
      border: `1px solid ${colors.border}`,
      display: "flex",
      alignItems: "center",
      padding: 2,
      boxSizing: "border-box",
      position: "relative",
      overflow: "hidden",
      transition: "background 160ms ease, border-color 160ms ease",
    },

    themeSwitchTrackDark: {
      background: "rgba(255,255,255,0.08)",
    },

    themeSwitchTrackLight: {
      background: "rgba(0,0,0,0.06)",
    },

    themeSwitchIcon: {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      fontSize: 12,
      pointerEvents: "none",
      transition: "opacity 160ms ease",
    },

    themeSwitchThumb: {
      width: 20,
      height: 20,
      borderRadius: 999,
      transition: "transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 180ms ease",
      boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
      position: "relative",
      zIndex: 1,
    },

    themeSwitchThumbDark: {
      background: colors.primaryBg,
      boxShadow: "0 10px 20px rgba(0,0,0,0.35)",
    },

    themeSwitchThumbLight: {
      background: colors.primaryBg,
      boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
    },

    themeSwitchLabel: {
      fontSize: 12,
      opacity: 0.9,
    },

    // NEW: AI Coach specific styles
    insightCard: {
      background: colors.cardAltBg,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      overflow: 'hidden',
    },

    insightHeader: {
      width: '100%',
      padding: 12,
      textAlign: 'left',
      background: 'transparent',
      border: 'none',
      color: colors.text,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      cursor: 'pointer',
    },

    insightTitle: {
      fontWeight: 800,
      fontSize: 14,
      marginBottom: 4,
    },

    insightMessage: {
      fontSize: 13,
      opacity: 0.85,
      lineHeight: 1.4,
    },

    insightChevron: {
      fontSize: 12,
      opacity: 0.6,
    },

    insightSuggestions: {
      padding: 12,
      paddingTop: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },

    suggestionsTitle: {
      fontSize: 12,
      fontWeight: 800,
      opacity: 0.75,
      marginBottom: 4,
    },

    suggestionRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: 10,
      background: colors.cardBg,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
    },

    suggestionName: {
      fontWeight: 700,
      fontSize: 14,
    },

    suggestionGroup: {
      fontSize: 11,
      opacity: 0.7,
      marginTop: 2,
      textTransform: 'capitalize',
    },

    addSuggestionBtn: {
      padding: '8px 12px',
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      background: colors.primaryBg,
      color: colors.primaryText,
      fontWeight: 800,
      fontSize: 13,
    },

    coachFooter: {
      fontSize: 12,
      opacity: 0.7,
      marginTop: 8,
      padding: '8px 10px',
      background: colors.appBg === "#0b0f14" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
      borderRadius: 8,
    },

    // Overflow menu (⋮ button + dropdown)
    overflowMenuBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
      color: colors.text,
      fontWeight: 900,
      fontSize: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      cursor: "pointer",
    },

    overflowBackdrop: {
      position: "fixed",
      inset: 0,
      zIndex: 40,
    },

    overflowMenu: {
      position: "absolute",
      top: "100%",
      right: 0,
      marginTop: 4,
      minWidth: 180,
      background: colors.cardBg,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      zIndex: 41,
      overflow: "hidden",
    },

    overflowMenuItem: {
      display: "block",
      width: "100%",
      textAlign: "left",
      padding: "12px 16px",
      background: "transparent",
      border: "none",
      color: colors.text,
      fontWeight: 700,
      fontSize: 14,
      cursor: "pointer",
    },

    overflowMenuItemDanger: {
      display: "block",
      width: "100%",
      textAlign: "left",
      padding: "12px 16px",
      background: "transparent",
      border: "none",
      color: colors.dangerText,
      fontWeight: 700,
      fontSize: 14,
      cursor: "pointer",
    },

    // Full-width add exercise button
    addExerciseFullBtn: {
      width: "100%",
      padding: "12px 16px",
      borderRadius: 12,
      border: `1px solid rgba(255,255,255,0.18)`,
      background: colors.primaryBg,
      color: colors.primaryText,
      fontWeight: 900,
      fontSize: 14,
      cursor: "pointer",
      marginBottom: 10,
    },

    // Reorder arrow buttons
    reorderBtnGroup: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      flexShrink: 0,
    },

    reorderBtn: {
      width: 30,
      height: 26,
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      background: colors.cardAltBg,
      color: colors.text,
      fontWeight: 900,
      fontSize: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      cursor: "pointer",
      opacity: 1,
    },

    // Compact exercise action buttons
    compactSecondaryBtn: {
      padding: "6px 8px",
      borderRadius: 8,
      border: `1px solid rgba(255,255,255,0.12)`,
      background: colors.cardAltBg,
      color: colors.text,
      fontWeight: 800,
      fontSize: 12,
      cursor: "pointer",
    },

    compactDangerBtn: {
      padding: "6px 8px",
      borderRadius: 8,
      border: `1px solid ${colors.dangerBorder}`,
      background: colors.dangerBg,
      color: colors.dangerText,
      fontWeight: 900,
      fontSize: 12,
      cursor: "pointer",
    },
  };
}