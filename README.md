# Kanpur Road Watch (free hosting version)

Static site (this folder) + Supabase free plan for data and photos. No server to run.

## 1. Supabase (5 min)
1. Create a free project at supabase.com (pick the region nearest India).
2. SQL Editor > New query > paste `supabase-setup.sql` > Run.
3. Project Settings > API: copy the Project URL and the anon / publishable key.

## 2. Configure
Edit `config.js`: paste the URL, the key, and your free CARTO key (https://carto.com/basemaps/apikey).
Use only Supabase's anon/publishable key here. This file is served publicly; never put a `service_role` or secret key in it.

## 3. Test locally
    python3 -m http.server 8000      # or: npx serve
Open http://localhost:8000 (opening index.html by double-click will not work).

## 4. Host free
- Netlify: drag this whole folder onto https://app.netlify.com/drop
- Vercel / Cloudflare Pages: push the folder to GitHub, import it, no build command, output = root.

## Moderation and care
- Remove spam: Supabase > Table Editor > reports > delete the row. Delete its file in Storage > road-photos.
- Free projects pause after a week with no activity; restore from the dashboard (or Pro plan).
- Export backups from Table Editor (CSV) now and then.
