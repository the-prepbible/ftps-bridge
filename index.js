const express = require('express');
const ftp = require('basic-ftp');
const crypto = require('crypto');
const { Writable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// FTPS connection settings from environment variables
const FTPS_HOST = process.env.FTPS_HOST;
const FTPS_USER = process.env.FTPS_USER;
const FTPS_PASS = process.env.FTPS_PASS;
const FTPS_PORT = parseInt(process.env.FTPS_PORT || '21', 10);
// Default file path – you can override this with ?path= in the URL
const FTPS_FILE_PATH = process.env.FTPS_FILE_PATH || '/path/on/server/file.csv';

// Shared secret callers must send as the x-bridge-key header (same header and
// key as rsr-eo-bridge). Without it the bridge serves no files at all.
const BRIDGE_KEY = process.env.BRIDGE_KEY || '';
// ?path= may only name a file inside these remote folders (no "..").
const ALLOWED_DIRS = ['/ftpdownloads/'];

function keyMatches(given) {
  if (!BRIDGE_KEY || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(BRIDGE_KEY).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireKey(req, res, next) {
  if (keyMatches(req.get('x-bridge-key'))) return next();
  res.status(401).json({ error: 'missing or wrong x-bridge-key' });
}

function allowedPath(p) {
  if (p === FTPS_FILE_PATH) return true;
  if (typeof p !== 'string' || p.includes('..') || p.includes('\\')) return false;
  return ALLOWED_DIRS.some((dir) => p.startsWith(dir) && p.length > dir.length && !p.slice(dir.length).includes('/'));
}

app.get('/download-file', requireKey, async (req, res) => {
  // Allow overriding the remote file with ?path=/ftpdownloads/some-file.csv
  const remotePath = req.query.path || FTPS_FILE_PATH;
  if (!allowedPath(remotePath)) {
    return res.status(403).json({ error: 'path not allowed' });
  }

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: FTPS_HOST,
      port: FTPS_PORT,
      user: FTPS_USER,
      password: FTPS_PASS,
      secure: true, // Enable FTPS (explicit TLS)
      secureOptions: {
        // If your FTPS server uses a self-signed certificate and you need to ignore it:
        rejectUnauthorized: false,
      },
    });

    // Collect the downloaded data into memory using a proper Writable stream
    const chunks = [];
    const dest = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    // Download the remote file into our Writable stream
    await client.downloadTo(dest, remotePath);
    dest.end();

    const fileBuffer = Buffer.concat(chunks);

    // Adjust content type / filename if your file isn't CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="file.csv"');
    res.send(fileBuffer);
  } catch (error) {
    console.error('FTPS Error:', error);
    res.status(500).json({
      error: 'Failed to download file from FTPS',
      details: error.message,
    });
  } finally {
    client.close();
  }
});

// Simple health check / info route (serves no data; used as a warm-up ping)
app.get('/', (req, res) => {
  res.send('FTPS Bridge is running.');
});

app.listen(PORT, () => {
  console.log(`FTPS Bridge is running on port ${PORT}`);
});
