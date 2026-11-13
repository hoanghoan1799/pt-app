import { Column } from "typeorm";

// STORED generated columns that turn a text actor reference into a real
// foreign key. The app keeps writing the text ("user:12", "admin:3", the
// chat scheme "user" / "admin:3", or a kind + id pair); the database derives
// the account id from it, checks that the account exists and deletes the row
// with the account. A key that is not shaped like an account key yields NULL
// (no check), so only well-formed dangling keys are rejected.
const ID = "[1-9][0-9]{0,8}";

// "user:<id>" -> id
export const userKeyId = (column: string) =>
  `CASE WHEN "${column}" ~ '^user:${ID}$' THEN substring("${column}" from 6)::integer END`;

// "admin:<id>" -> id (the social scheme and the chat scheme share this form)
export const adminKeyId = (column: string) =>
  `CASE WHEN "${column}" ~ '^admin:${ID}$' THEN substring("${column}" from 7)::integer END`;

// (kind, id) pair -> id when the kind matches
export const kindId = (kindColumn: string, idColumn: string, kind: string) =>
  `CASE WHEN "${kindColumn}" = '${kind}' THEN "${idColumn}" END`;

// The generated column. TypeORM never writes it (insert/update false).
export const GeneratedId = (asExpression: string) =>
  Column({
    type: "integer",
    nullable: true,
    insert: false,
    update: false,
    generatedType: "STORED",
    asExpression,
  });

// CHECK expressions that make every account key well formed, so a key is either
// FK-checked through its generated column or refused (never stored unchecked).
// The id part has at most 9 digits, like the generated columns.
export const socialKeyCheck = (column: string) =>
  `"${column}" ~ '^(user|admin):${ID}$'`;

// Chat scheme: "user" (the conversation's trainee) or "admin:<id>".
export const chatKeyCheck = (column: string) =>
  `"${column}" ~ '^(user|admin:${ID})$'`;

// Alias targets also allow the PT side as a whole ("pt").
export const aliasTargetCheck = (column: string) =>
  `"${column}" ~ '^((user|admin):${ID}|pt)$'`;
