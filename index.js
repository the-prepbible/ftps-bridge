const express = require('express');
const ftp = require('basic-ftp');

const app = express();
const PORT = process.env.PORT || 3000;

// FTPS credentials from environment variables
const FTPS_HOST = process.env.FTPS_HOST;
const FTPS_USER = process.env.FTPS_USER;
const FTPS_PASS = process.env.FTPS_PASS;
const FTPS_PORT = process.env.FTPS_PORT || 21;

// Default file path (you can override with ?path= in URL)
const FTPS_FILE_PATH = process.env.FTPS_FILE_PATH || '/path/on/server/file.csv';

app.get('/download-file', async (req, res) => {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    // Allow ?path=/some/file.csv overrides
    const remotePath = req.query.path || FTPS_FILE_PATH;

    try {
        await client.access({
            host: FTPS_HOST,
            port: FTPS_PORT,
            user: FTPS_USER,
            password: FTPS_PASS,
            secure: true,  // Enable FTPS
            secureOptions: {
                rejectUnauthorized: false // Allow self-signed certs if needed
            }
        });

        const chunks = [];

        await client.downloadTo(
            {
                write: (chunk) => chunks.push(chunk),
                end: () => {}
            },
            remotePath
        );

        const fileBuffer = Buffer.concat(chunks);

        // Adjust MIME type if your file is XML, JSON, etc.
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="file.csv"');

        res.send(fileBuffer);

    } catch (error) {
        console.error('FTPS Error:', error);
        res.status(500).json({
            error: 'Failed to download file from FTPS',
            details: error.message
        });
    } finally {
        client.close();
    }
});

// Basic root message
app.get('/', (req, res) => {
    res.send('FTPS Bridge is running. Use /download-file to fetch the file.');
});

app.listen(PORT, () => {
    console.log(`FTPS Bridge is running on port ${PORT}`);
});
