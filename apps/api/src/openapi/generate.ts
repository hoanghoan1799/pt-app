import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { AppModule } from "../app.module.js";
import { buildOpenApiDocument, configureApp } from "../app.setup.js";

// A DataSource that never connects: building the document only reads route
// metadata, so the generator needs no database.
const offlineDataSource = () => {
  const repository = {};
  const manager = { getRepository: () => repository };

  return {
    isInitialized: false,
    entityMetadatas: [],
    manager,
    options: {},
    getRepository: () => repository,
    destroy: () => Promise.resolve(),
  };
};

// The same document `pnpm openapi` writes to apps/api/openapi.json.
export const generateOpenApiDocument = async () => {
  process.env.DATABASE_URL ??=
    "postgres://openapi:openapi@localhost:5432/openapi";
  process.env.NODE_ENV = "production";
  process.env.LOG_LEVEL = "silent";

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource)
    .useValue(offlineDataSource())
    .compile();
  const app = moduleRef.createNestApplication();

  configureApp(app);
  const document = buildOpenApiDocument(app);

  await app.close();
  return document;
};

// Stable text for the committed file and for the staleness comparison.
export const serializeOpenApiDocument = (document: object) =>
  `${JSON.stringify(document, null, 2)}\n`;
