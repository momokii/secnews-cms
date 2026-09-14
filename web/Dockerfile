# SecNews CMS web (React/Vite SPA) — build with Node 22, serve with nginx.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# tsc -b && vite build → dist/
RUN npm run build

# ── Runtime: unprivileged nginx on port 8080 ────────────────────────────────
# nginx:stable-alpine ships uid 101 `nginx`; the bundled nginx.conf redirects
# pid/temp paths to /tmp and logs to the container streams so all of them are
# writable without root.
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER 101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
