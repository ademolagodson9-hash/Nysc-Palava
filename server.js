const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, game: 'PALAVA' }));
app.use(express.static(__dirname, { extensions: ['html'], maxAge: '1h' }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(PORT, '0.0.0.0', () => console.log('PALAVA listening on ' + PORT));
