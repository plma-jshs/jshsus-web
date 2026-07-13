FROM node:24-alpine
WORKDIR /app
RUN corepack enable && corepack install --global pnpm@10.30.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile --filter @jshsus/db...
COPY packages/db packages/db
WORKDIR /app/packages/db
CMD ["pnpm", "db:migrate"]
