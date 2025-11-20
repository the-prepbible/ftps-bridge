const express = require('express');
const ftp = require('basic-ftp');
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

app.get('/download-file', async (req, res) => {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  // Allow overriding the remote file with ?path=/some/file.csv
  const remotePath = req.query.path || FTPS_FILE_PATH;

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

// Simple health check / info route
app.get('/', (req, res) => {
  res.send('FTPS Bridge is running. Use /download-file to fetch the file.');
});

app.listen(PORT, () => {
  console.log(`FTPS Bridge is running on port ${PORT}`);
});
