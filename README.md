# Smart Attendance Notification System

**Frontend:** React + Vite  
**Backend:** Node.js + Express  
**Excel automation:** Python + Pandas + OpenPyXL  
**Database:** None for this version. Preview batches and delivery logs are held in memory and reset when the backend restarts.

The frontend uses a clean, light institutional design inspired by the SGGS Central Library site: generous whitespace, restrained green accents, rounded panels, clear typography, and practical tables.

## Requirements
- Node.js 18+
- Python 3.10+
- npm

## Project structure
```text
smart-attendance/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── styles.css
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── .gitignore
│   ├── server.js
│   ├── routes/
│   │   └── attendance.js
│   ├── services/
│   │   └── notifications.js
│   └── python/
│       ├── requirements.txt
│       └── attendance.py
└── README.md
```

## 1. Install Python dependencies
From the project root:

```bash
python -m venv backend/.venv
# Windows PowerShell:
backend\.venv\Scripts\Activate.ps1
# Windows CMD:
backend\.venv\Scripts\activate.bat
# Ubuntu/macOS:
source backend/.venv/bin/activate

pip install -r backend/python/requirements.txt
```

## 2. Install and start the backend
Open a terminal:

```bash
cd backend
npm install
```

The ZIP includes `backend/.env` with blank credentials (copy from `.env.example` if missing). Open that file and fill the SMTP values below. It is excluded from Git, so do not commit your credentials. Then start:

```bash
npm run dev
```

The API runs at `http://localhost:8000`. Health check: `http://localhost:8000/api/health`.

If the Python executable cannot be found, set `PYTHON_BIN` in `backend/.env` to the absolute path of the Python executable in your virtual environment. Examples:
- Windows: `PYTHON_BIN=..\\.venv\\Scripts\\python.exe` is relative to the backend folder only if you put the venv there as `backend/.venv`.
- Linux/macOS: `PYTHON_BIN=./.venv/bin/python`

By default the backend uses `python` on Windows and `python3` on Linux/macOS. Because this is a local starter, check `PYTHON_BIN` if the subprocess reports that Python is unavailable.

## 3. Install and start React
In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`.

## 4. Excel format
Required headings (case-insensitive; common variants supported):
- Registration No.
- Student Name
- Attendance Percentage
- At least one contact column: Parent Email, Student Email or Parent Mobile No. (each row needs at least one filled in)

Optional: any of the contact columns not used above. Parent Mobile is only needed for SMS.

Phone numbers should be stored as text in Excel and include the country code, e.g. `+919876543210`. If a 10-digit Indian mobile is supplied, the script prepends `+91`. Keep registration numbers as text to preserve leading zeroes.

Every valid row is included in the preview. The app does not apply an attendance threshold because you selected every student in the workbook.

## 5. Configure email (optional)
The backend uses Nodemailer SMTP. Configure these values in `backend/.env`:
- `SMTP_HOST`
- `SMTP_PORT` (usually `587`)
- `SMTP_SECURE=false` for STARTTLS on port 587; use `true` for port 465
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

For Gmail, use an App Password, not your normal account password. Create it from your Google Account security settings after enabling 2-Step Verification. Use the 16-character app password in `SMTP_PASS` (spaces can be omitted). Restart the backend after changing `.env`.

Example Gmail configuration:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=your-account@gmail.com
```

For port `465`, set `SMTP_SECURE=true`. For port `587`, use `SMTP_SECURE=false`. In the app, upload a workbook containing a valid `Parent Email` or `Student Email`, review the preview, select **Email** (you may untick SMS), and confirm sending. The health endpoint `/api/health` reports whether the required SMTP values are present; it does not verify the password until a message is sent. Test first with your own email address.

## 6. Configure SMS (optional)
This starter supports Twilio:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

For production in India, verify that your provider, sender ID, templates, and DLT configuration meet applicable TRAI/provider requirements. Provider availability and pricing vary. Do not test against real parents until the faculty has reviewed the recipient list and message.

## 7. Safety and limitations
- The UI shows the extracted data and message previews before sending, then asks for confirmation.
- A channel without credentials is marked `skipped`, not falsely reported as sent.
- `submitted` means the provider accepted the request. It does not prove final delivery.
- This version uses in-memory preview batches and in-memory delivery logs. Restarting the backend clears them. There is no database yet.
- Add authentication, authorization, HTTPS, rate limits, upload limits, audit/retention rules, and institution approval before deployment.
- Do not commit `.env`, real student records, parent phone numbers, or email addresses to Git.
- For a real institute, have authorized faculty confirm the lawful basis and recipient list before sending personal information.

## API routes
- `GET /api/health`
- `GET /api/email/verify` (tests the SMTP login for real; use this first when emails fail)
- `POST /api/attendance/upload` multipart field `file`
- `POST /api/attendance/send` JSON: `{ "batchId": "...", "channels": ["email","sms"], "confirmSend": true }`
- `GET /api/attendance/report`
