# syntax=docker/dockerfile:1
# Multi-stage build for Kairos.Web — the single app host (Razor UI + /api/* + /mcp + sync worker).
# Build context is the repo root (see compose: build.context = .).

# ── Stage 1: build front-end assets with Vite (frontend-builder owns ClientApp) ──
FROM node:22-alpine AS assets
WORKDIR /app/ClientApp
COPY src/Kairos.Web/ClientApp/package*.json ./
RUN npm ci
COPY src/Kairos.Web/ClientApp/ ./
# Vite emits hash-fingerprinted bundles to ../wwwroot/dist (+ vite-manifest.json).
RUN npm run build

# ── Stage 2: restore, build & publish the .NET app ───────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Restore against just the project files first for layer caching.
COPY Directory.Build.props ./
COPY Kairos.slnx ./
COPY src/Kairos.Web/Kairos.Web.csproj src/Kairos.Web/
COPY src/Kairos.ServiceDefaults/Kairos.ServiceDefaults.csproj src/Kairos.ServiceDefaults/
COPY src/Kairos.Domain/Kairos.Domain.csproj src/Kairos.Domain/
COPY src/Kairos.Application/Kairos.Application.csproj src/Kairos.Application/
COPY src/Kairos.Infrastructure/Kairos.Infrastructure.csproj src/Kairos.Infrastructure/
RUN dotnet restore src/Kairos.Web/Kairos.Web.csproj
# Bring in the full source + the Vite-built assets, then publish.
COPY . .
COPY --from=assets /app/wwwroot/dist src/Kairos.Web/wwwroot/dist
RUN dotnet publish src/Kairos.Web/Kairos.Web.csproj -c Release -o /app/publish /p:UseAppHost=false

# ── Stage 3: slim, non-root runtime ──────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
# The aspnet image ships a non-root `app` user exposed via $APP_UID.
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=1
EXPOSE 8080
ENTRYPOINT ["dotnet", "Kairos.Web.dll"]
