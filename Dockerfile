# Production image (Next.js standalone output).
# In production the edge proxy (Caddy) sends /api and /sanctum straight to Laravel; the Next.js
# rewrites are a fallback. Rewrites are resolved at BUILD time, hence BACKEND_URL is a build arg.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build arguments.
ARG NEXT_PUBLIC_REVERB_KEY=""
ARG NEXT_PUBLIC_REVERB_HOST=""
ARG NEXT_PUBLIC_REVERB_PORT="443"
ARG NEXT_PUBLIC_REVERB_SCHEME="https"
ARG BACKEND_URL="http://app:8000"
ENV NEXT_PUBLIC_REVERB_KEY=$NEXT_PUBLIC_REVERB_KEY \
    NEXT_PUBLIC_REVERB_HOST=$NEXT_PUBLIC_REVERB_HOST \
    NEXT_PUBLIC_REVERB_PORT=$NEXT_PUBLIC_REVERB_PORT \
    NEXT_PUBLIC_REVERB_SCHEME=$NEXT_PUBLIC_REVERB_SCHEME \
    BACKEND_URL=$BACKEND_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
