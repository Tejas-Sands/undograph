FROM node:24-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315 AS build
WORKDIR /opt/undograph
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY gateway ./gateway
COPY worker ./worker
COPY shared ./shared
COPY fixtures/northstar.json ./fixtures/northstar.json
COPY vite.gateway.config.ts ./
RUN npm run build:gateway && npm prune --omit=dev --ignore-scripts

FROM falkordb/falkordb@sha256:b0bdcac2cbaff989e77cb0610439b7a9289e86de033ccbbd4368b66fb680ae7a
WORKDIR /opt/undograph
ENV NODE_ENV=production PORT=8080 BROWSER=0
COPY --from=build /opt/undograph/package.json ./
COPY --from=build /opt/undograph/node_modules ./node_modules
COPY --from=build /opt/undograph/dist/gateway ./dist/gateway
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["node", "dist/gateway/server.mjs"]
