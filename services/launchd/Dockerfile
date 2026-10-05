# launchd: Pop Launch backend (chain sync, metadata, discovery API, settlement keeper).
# Build from the repository root:  docker build -f services/launchd/Dockerfile -t poplaunch-launchd .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/math/package.json packages/math/
COPY services/launchd/package.json services/launchd/
RUN pnpm install --frozen-lockfile --filter @pop/launchd...
COPY packages/sdk packages/sdk
COPY packages/math packages/math
COPY services/launchd services/launchd
RUN pnpm --filter @pop/math build && pnpm --filter @pop/sdk build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production PORT=8788
EXPOSE 8788
# KEEPER_KEYPAIR points at a file mounted from a secret; DATABASE_URL, RPC_URL, SOLANA_NETWORK, PUBLIC_URL,
# SIGN_DOMAIN and TRUSTED_PROXY=1 come from the host's environment.
CMD ["pnpm", "--filter", "@pop/launchd", "start"]
