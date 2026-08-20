FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable && corepack install --global pnpm@10.30.0

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/jshsus/package.json apps/jshsus/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG VITE_GA_MEASUREMENT_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
COPY . .
RUN pnpm --filter @jshsus/types build
RUN pnpm --filter @jshsus/ui build
RUN pnpm --filter @platform/jshsus build

FROM nginx:1.27-alpine AS runner
COPY apps/jshsus/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/jshsus/dist /usr/share/nginx/html
EXPOSE 80
