# {{PROJECT_NAME}} — Self-hosted Test Runner

Exported from Verity on {{EXPORT_DATE}}. This is a complete, standalone copy of
your test suite for **{{SITE_URL}}** — no account, no billing, no external
dependency on the Verity platform. Everything runs on your own infrastructure.

## Run locally
```bash
npm install
npm start
# open http://localhost:4100
```

## Run with Docker (recommended)
```bash
docker compose up --build -d
# open http://localhost:4100
```

Your dataset and results persist in the `verity_runner_data` volume.

## What's seeded
- `data/project.json` — this project's name and site URL
- `data/tests.json` — the exact test suite you built in Verity
- `data/dataset.json` — your dataset **at export time** (auth tokens etc. —
  review before running against a live environment; rotate anything sensitive
  if this package will be shared)

Edit the dataset from the **Dataset** button in the UI, or directly in
`data/dataset.json`. Upload more tests any time via **Upload more tests**.

## Deploy to a cloud provider

Same image, same steps as any Docker app — pick your provider:

**AWS (ECS Fargate):** push to ECR, create a Fargate service on this image,
port 4100, mount EFS at `/app/data` for persistence.

**Google Cloud (Cloud Run):**
```bash
gcloud builds submit --tag gcr.io/<project-id>/{{SLUG}}
gcloud run deploy {{SLUG}} --image gcr.io/<project-id>/{{SLUG}} --port 4100 --allow-unauthenticated
```

**Azure (Container Apps):**
```bash
az acr build --registry <registry> --image {{SLUG}}:latest .
az containerapp create --name {{SLUG}} --image <registry>.azurecr.io/{{SLUG}}:latest --target-port 4100 --ingress external
```

**Any VM / DigitalOcean:**
```bash
docker compose up --build -d
# put a reverse proxy (Caddy/nginx) in front for TLS if exposing publicly
```

**Kubernetes:** build, push, deploy as a Deployment + Service +
PersistentVolumeClaim mounted at `/app/data`. Single port, no special
privileges required.

## Security note

`data/dataset.json` may contain real auth tokens or API keys you entered in
Verity. Treat this exported folder with the same care as a secrets file —
don't commit it to a public repo.
