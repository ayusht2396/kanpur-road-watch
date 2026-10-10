const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'reports.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const CARTO_API_KEY = process.env.CARTO_API_KEY || '';
const BOUNDS = { minLat: 26.30, maxLat: 26.60, minLng: 80.15, maxLng: 80.55 }; // Kanpur region
const SEVERITIES = ['minor', 'moderate', 'severe', 'dangerous'];
const TYPES = ['pothole', 'broken', 'waterlogging', 'manhole', 'other'];

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
let reports = [];
try { reports = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(reports));
  fs.renameSync(tmp, DB_FILE);
}

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[file.mimetype])
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !!EXT[file.mimetype])
});

// simple per-IP rate limit: 15 writes / hour
const hits = new Map();
function limited(req, res, next) {
  const now = Date.now(), list = (hits.get(req.ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= 15) return res.status(429).json({ error: 'Too many submissions. Try again later.' });
  list.push(now); hits.set(req.ip, list); next();
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.get('/config.js', (req, res) => {
  res.type('application/javascript').send('window.CONFIG=' + JSON.stringify({ cartoKey: CARTO_API_KEY }) + ';');
});
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const visible = r => r.fixedVotes < 3;
app.get('/api/reports', (req, res) => res.json(reports.filter(visible)));

app.post('/api/reports', limited, upload.single('photo'), (req, res) => {
  const lat = parseFloat(req.body.lat), lng = parseFloat(req.body.lng);
  const clean = f => f && fs.unlink(f.path, () => {});
  if (!(lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lng >= BOUNDS.minLng && lng <= BOUNDS.maxLng)) {
    clean(req.file); return res.status(400).json({ error: 'Location must be within Kanpur.' });
  }
  if (!SEVERITIES.includes(req.body.severity) || !TYPES.includes(req.body.type)) {
    clean(req.file); return res.status(400).json({ error: 'Choose a severity and issue type.' });
  }
  const r = {
    id: crypto.randomBytes(6).toString('hex'), lat, lng,
    severity: req.body.severity, type: req.body.type,
    description: String(req.body.description || '').slice(0, 400),
    photo: req.file ? '/uploads/' + req.file.filename : null,
    createdAt: new Date().toISOString(), confirmVotes: 1, fixedVotes: 0
  };
  reports.push(r); save(); res.status(201).json(r);
});

app.post('/api/reports/:id/vote', limited, (req, res) => {
  const r = reports.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (req.body.vote === 'confirm') r.confirmVotes++;
  else if (req.body.vote === 'fixed') r.fixedVotes++;
  else return res.status(400).json({ error: 'Bad vote' });
  save(); res.json(r);
});

app.delete('/api/reports/:id', (req, res) => {
  if (!ADMIN_TOKEN || req.get('x-admin-token') !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  const i = reports.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const [r] = reports.splice(i, 1);
  if (r.photo) fs.unlink(path.join(UPLOAD_DIR, path.basename(r.photo)), () => {});
  save(); res.json({ ok: true });
});

app.use((err, req, res, next) => res.status(400).json({ error: err.message || 'Upload failed' }));
app.listen(PORT, () => console.log('Kanpur Road Watch on :' + PORT));
