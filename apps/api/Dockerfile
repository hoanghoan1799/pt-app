# Build context is the repository root (see docker-compose.yml):
#   docker build -f apps/api/Dockerfile .
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Reads the pnpm version from "packageManager" in the root package.json.
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter @pt/api...
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @pt/contracts build \
    && pnpm --filter @pt/api build \
    && pnpm --filter @pt/api deploy --prod --legacy /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
