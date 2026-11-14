#!/usr/bin/env bash
# Deploy the Cerberus backend to Cloud Run.
#
# Prereqs (run once, interactively):
#   gcloud auth login
#   gcloud auth application-default login
#   gcloud config set project "$GCP_PROJECT_ID"
#
# Then:
#   GCP_PROJECT_ID=your-project REGION=us-central1 ./deploy/cloudrun.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-cerberus-backend}"
IMAGE="${IMAGE:-gcr.io/${PROJECT_ID}/${SERVICE}"
ALLOWLIST="${CERBERUS_BACKEND_HOSTS:-*.run.app}"

gcloud config set project "${PROJECT_ID}"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

echo ">> building ${IMAGE}"
gcloud builds submit --tag "${IMAGE}" .

echo ">> deploying ${SERVICE}"
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 1 \
  --max-instances 4 \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300s \
  --set-env-vars "CERBERUS_ALLOW_MUTATION=false,CERBERUS_WS_ROOT=/tmp/cerb-ws,CERBERUS_MAX_WORKERS=2" \
  --set-secrets "CERBERUS_INGEST_SECRET=cerberus-ingest-secret:latest,CERBERUS_JOB_TOKEN=cerberus-job-token:latest,CERBERUS_MCP_TOKEN=cerberus-mcp-token:latest,CERBERUS_COOKIE_SECRET=cerberus-cookie-secret:latest"

URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)')"
echo ">> backend: ${URL}"
echo ">> add to the Forge manifest external.fetch allowlist: ${ALLOWLIST}"
