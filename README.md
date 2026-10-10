# Kanpur Road Watch

Public web app: anyone can pin a bad road on the map, set a severity, and upload a photo.

## Run
    npm install
    npm start          # http://localhost:3000

## Host
Needs a Node host with persistent disk (Render, Railway, Fly.io, a VPS) or Docker:
    docker build -t road-watch . && docker run -p 80:3000 -v roaddata:/data -e ADMIN_TOKEN=secret -e CARTO_API_KEY=your-key road-watch

Map tiles: CARTO now needs a free API key (https://carto.com/basemaps/apikey, emailed instantly, 5M tiles/month). Set it as CARTO_API_KEY, otherwise tiles show an "API KEY REQUIRED" watermark.

Env vars: CARTO_API_KEY, PORT, DATA_DIR (reports.json + uploads live here; mount it as a volume), ADMIN_TOKEN (enables moderation).

## Deploy on Render
This repo includes a Render Blueprint (`render.yaml`) that configures the Node web service and a persistent disk mounted at `/var/data`. The persistent disk is required so reports and uploaded photos survive deploys and restarts; the configured Starter service and disk are paid Render resources, so check the current pricing before creating the service.

1. Push this project to a GitHub, GitLab, or Bitbucket repository. Do not commit `node_modules/`, `data/`, or secrets; these are excluded by `.gitignore`.
2. In Render, choose **New > Blueprint**, connect the repository, and apply the `render.yaml` Blueprint.
3. When prompted, provide `CARTO_API_KEY` as a secret environment value. Never put the key in source code.
4. After deployment, open the generated `onrender.com` URL and check that reports and photos persist after a redeploy.

Optionally add `ADMIN_TOKEN` in the Render service's environment settings to enable the moderation delete endpoint. Set it to a long, random secret.

## Moderate
    curl -X DELETE -H "x-admin-token: secret" https://your-site/api/reports/<id>

Reports disappear automatically after 3 "Fixed" votes. Limits: 15 writes/hour/IP, 6 MB photos, pins must be inside the Kanpur bounding box.
