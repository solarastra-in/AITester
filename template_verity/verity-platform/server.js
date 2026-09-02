require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { bootstrap } = require('./lib/seed');
bootstrap();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/org', require('./routes/org'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/package', require('./routes/package'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public')));
// Client-side routes under /console/* all serve the console SPA shell
app.get('/console*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'console', 'index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Verity platform listening on :${PORT}`));
