import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/callback`
);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Auth Routes
app.get('/api/auth/url', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url });
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    res.cookie('google_tokens', JSON.stringify(tokens), {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
    });
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/auth/status', (req, res) => {
  const tokens = req.cookies.google_tokens;
  res.json({ isAuthenticated: !!tokens });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('google_tokens');
  res.json({ success: true });
});

// Google Sheets API Helper
async function getSheetsClient(req: express.Request) {
  const tokensStr = req.cookies.google_tokens;
  if (!tokensStr) throw new Error('Not authenticated');
  const tokens = JSON.parse(tokensStr);
  oauth2Client.setCredentials(tokens);
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

// Sync Routes
app.get('/api/sync', async (req, res) => {
  try {
    const sheets = await getSheetsClient(req);
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID not set');

    const ranges = ['Stock!A2:D', 'Sales!A2:D', 'Expenses!A2:C', 'Khata!A2:F'];
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    const valueRanges = response.data.valueRanges || [];
    
    const stock = (valueRanges[0].values || []).map(row => ({
      name: row[0] || '',
      price: parseFloat(row[1]) || 0,
      qty: parseInt(row[2]) || 0,
      barcode: row[3] || ''
    }));

    const sales = (valueRanges[1].values || []).map(row => ({
      id: row[0] || '',
      date: row[1] || '',
      total: parseFloat(row[2]) || 0,
      items: JSON.parse(row[3] || '[]')
    }));

    const expenses = (valueRanges[2].values || []).map(row => ({
      title: row[0] || '',
      amt: parseFloat(row[1]) || 0,
      date: row[2] || ''
    }));

    const khata = (valueRanges[3].values || []).map(row => ({
      name: row[0] || '',
      due: parseFloat(row[1]) || 0,
      phone: row[2] || '',
      description: row[3] || '',
      date: row[4] || '',
      status: row[5] || 'unpaid'
    }));

    res.json({ stock, sales, expenses, khata });
  } catch (error: any) {
    console.error('Sync pull error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sync', async (req, res) => {
  try {
    const sheets = await getSheetsClient(req);
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID not set');

    const data = req.body;

    const stockValues = data.stock.map((p: any) => [p.name, p.price, p.qty, p.barcode]);
    const salesValues = data.sales.map((s: any) => [s.id, s.date, s.total, JSON.stringify(s.items)]);
    const expensesValues = data.expenses.map((e: any) => [e.title, e.amt, e.date]);
    const khataValues = data.khata.map((k: any) => [k.name, k.due, k.phone, k.description, k.date, k.status]);

    const dataToUpdate = [
      { range: 'Stock!A2', values: stockValues.length ? stockValues : [['', '', '', '']] },
      { range: 'Sales!A2', values: salesValues.length ? salesValues : [['', '', '', '']] },
      { range: 'Expenses!A2', values: expensesValues.length ? expensesValues : [['', '', '']] },
      { range: 'Khata!A2', values: khataValues.length ? khataValues : [['', '', '', '', '', '']] },
    ];

    // Clear existing data first (simple way: overwrite with empty if needed, but here we just update)
    // For a real production app, we'd clear the ranges first.
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: { ranges: ['Stock!A2:Z', 'Sales!A2:Z', 'Expenses!A2:Z', 'Khata!A2:Z'] }
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: dataToUpdate,
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Sync push error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy Sync Proxy (for Apps Script)
app.get('/api/legacy-sync', async (req, res) => {
  const scriptUrl = "https://script.google.com/macros/s/AKfycbxafbf6YCai-4imFL14ttmu3cxptXxMylaTFU2VT2pgc5FX-EArwjSNk6PNZTgJQrIWWQ/exec";
  try {
    const response = await fetch(scriptUrl);
    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    console.error('Legacy pull error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/legacy-sync', async (req, res) => {
  const scriptUrl = "https://script.google.com/macros/s/AKfycbxafbf6YCai-4imFL14ttmu3cxptXxMylaTFU2VT2pgc5FX-EArwjSNk6PNZTgJQrIWWQ/exec";
  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const result = await response.text();
    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Legacy sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
