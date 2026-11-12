import { MEAL_PLAN_LIMITS } from "@pt/contracts";

import { calculateCalories, MACROS } from "./nutrition-math.js";
import type { MacroAmounts } from "./types.js";

// Auto grams are rounded to this step (Q5).
export const GRAMS_STEP = 5;

// Fat weighs 100x less than protein and carbs in the solver: the foods the PT
// chose are fitted to protein and carbs first, fat only decides the grams of
// foods that are mostly fat (oil), and what is left over is shown as a gap.
const SOLVER_MACRO_WEIGHTS: Record<keyof MacroAmounts, number> = {
  protein: 1,
  carbs: 1,
  fat: 0.01,
};

export type MacroGap = MacroAmounts;

type SolverFood = { id: number; protein: number; carbs: number; fat: number };

export interface SolveInput {
  // What the meal should reach, in grams of each macro.
  target: MacroAmounts;
  // Foods whose grams are solved.
  foods: SolverFood[];
  // Foods that keep their grams (e.g. 300 g of broccoli).
  fixed?: { food: SolverFood; grams: number }[];
}

export interface SolveResult {
  grams: { foodId: number; grams: number }[];
  // Macros of the solved and fixed foods together, with the rounded grams.
  totals: MacroAmounts;
  // Calories of `totals` (4/4/9), whole number.
  kcal: number;
  // target - totals, one decimal: positive = short, negative = over.
  gap: MacroGap;
}

const EPSILON = 1e-9;
const MAX_ITERATIONS = 200;

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
};

// Solves the square system `matrix · x = vector` (Gaussian elimination with
// partial pivoting). A tiny ridge keeps two identical foods solvable.
const solveLinear = (matrix: number[][], vector: number[]) => {
  const size = vector.length;
  const rows = matrix.map((row, i) => [
    ...row.map((value, j) => (i === j ? value + 1e-12 : value)),
    vector[i],
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
        pivot = row;
      }
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];

    for (let row = column + 1; row < size; row += 1) {
      const factor = rows[row][column] / rows[column][column];

      for (let k = column; k <= size; k += 1) {
        rows[row][k] -= factor * rows[column][k];
      }
    }
  }

  const solution = new Array<number>(size).fill(0);

  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = rows[row][size];

    for (let k = row + 1; k < size; k += 1) {
      sum -= rows[row][k] * solution[k];
    }
    solution[row] = sum / rows[row][row];
  }
  return solution;
};

// Least squares restricted to the columns in `passive`; the others stay 0.
const solvePassive = (
  columns: number[][],
  rhs: number[],
  passive: number[],
) => {
  const gram = passive.map((i) =>
    passive.map((j) =>
      columns[i].reduce((sum, value, row) => sum + value * columns[j][row], 0),
    ),
  );
  const moment = passive.map((i) =>
    columns[i].reduce((sum, value, row) => sum + value * rhs[row], 0),
  );
  const solved = solveLinear(gram, moment);
  const full = new Array<number>(columns.length).fill(0);

  passive.forEach((column, index) => {
    full[column] = solved[index];
  });
  return full;
};

// Non-negative least squares (Lawson-Hanson): x >= 0 minimising |A·x - b|.
// `columns[i]` is column i of A. Deterministic: ties pick the lower index.
const nonNegativeLeastSquares = (columns: number[][], rhs: number[]) => {
  const count = columns.length;
  const x = new Array<number>(count).fill(0);
  const passive: number[] = [];
  const residual = [...rhs];

  const gradient = () =>
    columns.map((column) =>
      column.reduce((sum, value, row) => sum + value * residual[row], 0),
    );
  const refreshResidual = () => {
    rhs.forEach((value, row) => {
      residual[row] =
        value - columns.reduce((sum, column, i) => sum + column[row] * x[i], 0);
    });
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const w = gradient();
    let best = -1;

    for (let i = 0; i < count; i += 1) {
      if (
        !passive.includes(i) &&
        w[i] > EPSILON &&
        (best < 0 || w[i] > w[best])
      ) {
        best = i;
      }
    }
    if (best < 0) {
      break;
    }
    passive.push(best);

    for (let inner = 0; inner < MAX_ITERATIONS; inner += 1) {
      const s = solvePassive(columns, rhs, passive);

      if (passive.every((i) => s[i] > EPSILON)) {
        s.forEach((value, i) => {
          x[i] = value;
        });
        break;
      }

      // Step back to the edge of the feasible region, drop what hit 0.
      // A food already at 0 that wants to go lower (x = s = 0) steps 0.
      const alpha = Math.min(
        ...passive
          .filter((i) => s[i] <= EPSILON)
          .map((i) => (x[i] - s[i] > 0 ? x[i] / (x[i] - s[i]) : 0)),
      );

      for (let i = 0; i < count; i += 1) {
        x[i] += alpha * (s[i] - x[i]);
      }
      for (let k = passive.length - 1; k >= 0; k -= 1) {
        if (x[passive[k]] <= EPSILON) {
          x[passive[k]] = 0;
          passive.splice(k, 1);
        }
      }
    }
    refreshResidual();
  }
  return x;
};

// Q5/Q6: finds grams of `foods` that bring the meal to its protein / carb /
// fat target (non-negative least squares, kcal follows from the macros),
// rounded to 5 g. The macros are not equally strict: see SOLVER_MACRO_WEIGHTS.
// Whatever the foods cannot cover is returned as `gap`.
export const solveGrams = ({
  target,
  foods,
  fixed = [],
}: SolveInput): SolveResult => {
  const fixedTotals = fixed.reduce<MacroAmounts>(
    (sum, { food, grams }) => ({
      carbs: sum.carbs + (food.carbs * grams) / 100,
      protein: sum.protein + (food.protein * grams) / 100,
      fat: sum.fat + (food.fat * grams) / 100,
    }),
    { carbs: 0, protein: 0, fat: 0 },
  );

  // Row scale sqrt(weight) turns the weighted problem into a plain one.
  const scale = MACROS.map((macro) => Math.sqrt(SOLVER_MACRO_WEIGHTS[macro]));
  const columns = foods.map((food) =>
    MACROS.map((macro, row) => (food[macro] / 100) * scale[row]),
  );
  const rhs = MACROS.map(
    (macro, row) => (target[macro] - fixedTotals[macro]) * scale[row],
  );
  const solved = foods.length ? nonNegativeLeastSquares(columns, rhs) : [];

  // Never negative, never above what a plan accepts, never NaN/Infinity: what
  // the cap leaves out shows up in the gap.
  const grams = foods.map((food, index) => {
    const stepped = Math.round(solved[index] / GRAMS_STEP) * GRAMS_STEP;

    return {
      foodId: food.id,
      grams: Number.isFinite(stepped)
        ? Math.min(Math.max(0, stepped), MEAL_PLAN_LIMITS.MAX_GRAMS)
        : 0,
    };
  });
  const totals = foods.reduce<MacroAmounts>(
    (sum, food, index) => ({
      carbs: sum.carbs + (food.carbs * grams[index].grams) / 100,
      protein: sum.protein + (food.protein * grams[index].grams) / 100,
      fat: sum.fat + (food.fat * grams[index].grams) / 100,
    }),
    fixedTotals,
  );

  return {
    grams,
    totals,
    kcal: Math.round(calculateCalories(totals)),
    gap: {
      carbs: roundTo(target.carbs - totals.carbs, 1),
      protein: roundTo(target.protein - totals.protein, 1),
      fat: roundTo(target.fat - totals.fat, 1),
    },
  };
};
