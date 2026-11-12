export type ForeignKey = {
  table: string;
  column: string;
  parentTable: string;
  parentColumn: string;
  nullable: boolean;
};

export type LoadPlan = {
  // Tables, parents first.
  order: string[];
  // FK columns loaded as NULL and filled in by an UPDATE after every table is
  // loaded: self references and the one edge that breaks each cycle.
  deferred: ForeignKey[];
};

const byName = (a: ForeignKey, b: ForeignKey) =>
  `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`);

// Kahn's algorithm, one table at a time with an alphabetical tie-break, so the
// order is stable between runs.
const topoSort = (tables: string[], edges: ForeignKey[]) => {
  const pending = new Set(tables);
  const order: string[] = [];

  while (pending.size > 0) {
    const ready = [...pending]
      .filter((table) =>
        edges.every(
          (edge) => edge.table !== table || !pending.has(edge.parentTable),
        ),
      )
      .sort();

    if (ready.length === 0) {
      return { order, stuck: pending };
    }

    order.push(ready[0]);
    pending.delete(ready[0]);
  }

  return { order, stuck: pending };
};

const dependsOn = (
  from: string,
  target: string,
  edges: ForeignKey[],
  within: Set<string>,
) => {
  const seen = new Set<string>();
  const stack = [from];

  while (stack.length > 0) {
    const table = stack.pop() as string;

    if (table === target) {
      return true;
    }

    if (seen.has(table)) {
      continue;
    }

    seen.add(table);

    for (const edge of edges) {
      if (edge.table === table && within.has(edge.parentTable)) {
        stack.push(edge.parentTable);
      }
    }
  }

  return false;
};

// Works without superuser rights (no session_replication_role) and without
// deferrable constraints: a FK that closes a cycle must be nullable, is loaded
// as NULL and set afterwards.
export const planLoad = (
  tables: string[],
  foreignKeys: ForeignKey[],
): LoadPlan => {
  const deferred: ForeignKey[] = [];
  const active: ForeignKey[] = [];

  for (const fk of [...foreignKeys].sort(byName)) {
    if (fk.table === fk.parentTable) {
      if (!fk.nullable) {
        throw new Error(
          `Self-referencing FK ${fk.table}.${fk.column} is NOT NULL: cannot load it`,
        );
      }

      deferred.push(fk);
    } else {
      active.push(fk);
    }
  }

  for (;;) {
    const { order, stuck } = topoSort(tables, active);

    if (stuck.size === 0) {
      return { order, deferred };
    }

    const breakable = active
      .filter(
        (fk) =>
          fk.nullable &&
          stuck.has(fk.table) &&
          stuck.has(fk.parentTable) &&
          dependsOn(fk.parentTable, fk.table, active, stuck),
      )
      .sort(byName);

    if (breakable.length === 0) {
      throw new Error(
        `Circular foreign keys with no nullable column to defer among: ${[...stuck].sort().join(", ")}`,
      );
    }

    deferred.push(breakable[0]);
    active.splice(active.indexOf(breakable[0]), 1);
  }
};

export type RowRef = {
  // Primary key values joined with ":".
  key: string;
  // Values of every FK column and every referenced parent column.
  values: Record<string, number | string | null>;
};

export type OrphanMode = "report" | "null" | "skip";

export type OrphanGroup = {
  table: string;
  column: string;
  parentTable: string;
  // missing_parent: the parent never existed in the source.
  // parent_skipped: the parent row is skipped (--orphans=skip cascade).
  reason: "missing_parent" | "parent_skipped";
  count: number;
  sampleKeys: string[];
};

export type OrphanResolution = {
  groups: OrphanGroup[];
  // table -> primary keys of the rows that will not be copied.
  skipped: Record<string, string[]>;
  // table -> column -> primary keys whose value is copied as NULL.
  nulled: Record<string, Record<string, string[]>>;
  // mode=null but the FK column is NOT NULL: cannot be repaired.
  unnullable: OrphanGroup[];
};

const SAMPLE_SIZE = 10;

// Finds every row whose FK points at a missing parent. Pure function of the
// ids: `report` only lists them, `null` clears nullable columns, `skip` drops
// the row and, repeating, every row that pointed at a dropped row.
export const resolveOrphans = (
  foreignKeys: ForeignKey[],
  sourceRows: Record<string, RowRef[]>,
  mode: OrphanMode,
): OrphanResolution => {
  const fks = [...foreignKeys].sort(byName);
  // Work on copies: the caller keeps the original rows.
  const rows: Record<string, RowRef[]> = {};

  for (const [table, list] of Object.entries(sourceRows)) {
    rows[table] = list.map((row) => ({
      key: row.key,
      values: { ...row.values },
    }));
  }

  const skippedKeys = new Map<string, Set<string>>();
  const nulledKeys = new Map<string, Map<string, Set<string>>>();
  const groups = new Map<string, OrphanGroup>();
  const unnullable = new Map<string, OrphanGroup>();

  const parentValues = (table: string, column: string) => {
    const set = new Set<number | string>();

    for (const row of rows[table] ?? []) {
      const value = row.values[column];

      if (value !== null && value !== undefined) {
        set.add(value);
      }
    }

    return set;
  };

  const record = (
    target: Map<string, OrphanGroup>,
    fk: ForeignKey,
    reason: OrphanGroup["reason"],
    key: string,
  ) => {
    const id = `${fk.table}|${fk.column}|${reason}`;
    let group = target.get(id);

    if (!group) {
      group = {
        table: fk.table,
        column: fk.column,
        parentTable: fk.parentTable,
        reason,
        count: 0,
        sampleKeys: [],
      };
      target.set(id, group);
    }

    group.count += 1;

    if (group.sampleKeys.length < SAMPLE_SIZE) {
      group.sampleKeys.push(key);
    }
  };

  for (let round = 1; ; round += 1) {
    const reason = round === 1 ? "missing_parent" : "parent_skipped";
    const parents = new Map<string, Set<number | string>>();
    const toSkip: { table: string; key: string }[] = [];

    for (const fk of fks) {
      const id = `${fk.parentTable}.${fk.parentColumn}`;
      let known = parents.get(id);

      if (!known) {
        known = parentValues(fk.parentTable, fk.parentColumn);
        parents.set(id, known);
      }

      for (const row of rows[fk.table] ?? []) {
        const value = row.values[fk.column];

        if (value === null || value === undefined || known.has(value)) {
          continue;
        }

        if (mode === "null") {
          if (fk.nullable) {
            record(groups, fk, reason, row.key);

            const columns = nulledKeys.get(fk.table) ?? new Map();
            const keys = columns.get(fk.column) ?? new Set<string>();

            keys.add(row.key);
            columns.set(fk.column, keys);
            nulledKeys.set(fk.table, columns);
          } else {
            record(unnullable, fk, reason, row.key);
          }
        } else {
          record(groups, fk, reason, row.key);

          if (mode === "skip") {
            toSkip.push({ table: fk.table, key: row.key });
          }
        }
      }
    }

    if (mode !== "skip" || toSkip.length === 0) {
      break;
    }

    // Drop the rows, so their children show up as orphans in the next round.
    const dropped = new Map<string, Set<string>>();

    for (const { table, key } of toSkip) {
      const keys = dropped.get(table) ?? new Set<string>();

      keys.add(key);
      dropped.set(table, keys);
    }

    for (const [table, keys] of dropped) {
      const all = skippedKeys.get(table) ?? new Set<string>();

      for (const key of keys) {
        all.add(key);
      }

      skippedKeys.set(table, all);
      rows[table] = rows[table].filter((row) => !keys.has(row.key));
    }
  }

  return {
    groups: [...groups.values()],
    skipped: Object.fromEntries(
      [...skippedKeys].map(([table, keys]) => [table, [...keys]]),
    ),
    nulled: Object.fromEntries(
      [...nulledKeys].map(([table, columns]) => [
        table,
        Object.fromEntries(
          [...columns].map(([column, keys]) => [column, [...keys]]),
        ),
      ]),
    ),
    unnullable: [...unnullable.values()],
  };
};
