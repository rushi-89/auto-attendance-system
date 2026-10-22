
import { useEffect, useMemo, useState } from "react";
import collegeLogo from "./assets/college-logo.png";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileUp,
  FileText,
  Mail,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  XCircle,
  Search
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getAttendanceStatus(value) {
  const percentage = Number(value);

  if (percentage > 75) return "Good";
  if (percentage > 50) return "Warning";
  return "Critical";
}

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [channels, setChannels] = useState({
    email: true,
    sms: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [health, setHealth] = useState(null);
  const [filter, setFilter] = useState("");
  const [showMessages, setShowMessages] = useState(false);
  const [expandedStudents, setExpandedStudents] = useState({});
  const [activeTab, setActiveTab] = useState("overview");
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(response => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then(data => {
        setHealth(data);
        setChannels({
          email: true,
          sms: Boolean(data.smsConfigured)
        });
      })
      .catch(() => {
        setHealth({
          status: "offline",
          emailConfigured: false,
          smsConfigured: false
        });
      });
  }, []);

  const visibleRecords = useMemo(() => {
    if (!preview?.records) return [];

    const query = filter.trim().toLowerCase();

    if (!query) return preview.records;

    return preview.records.filter(student =>
      [
        student.registrationNo,
        student.studentName,
        student.parentMobile,
        student.emailRecipient
      ].some(value =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [preview, filter]);

  const reportData = useMemo(
    () =>
      (preview?.records || []).map(student => ({
        registrationNo: student.registrationNo || "",
        studentName: student.studentName || "",
        attendancePercentage: Number(student.attendancePercentage || 0),
        status: getAttendanceStatus(student.attendancePercentage),
        parentMobile: student.parentMobile || "",
        emailRecipient: student.emailRecipient || "",
        subjectAttendance: student.subjectAttendance || []
      })),
    [preview]
  );

  async function uploadWorkbook(event) {
    event.preventDefault();

    if (!file) {
      setError("Please select an Excel or CSV attendance file.");
      return;
    }

    setLoading(true);
    setError("");
    setPreview(null);
    setReport(null);
    setDeliveryHistory([]);
    setExpandedStudents({});

    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch(`${API}/api/attendance/upload`, {
        method: "POST",
        body: form
      });

      const data = await response.json();

      if (!response.ok) {
        const missing = data.missingColumns?.length
          ? ` Missing columns: ${data.missingColumns.join(", ")}.`
          : "";

        const rowProblem = data.rowErrors?.length
          ? ` First problem: row ${data.rowErrors[0].excelRow}: ${data.rowErrors[0].errors.join("; ")
          }.`
          : "";

        throw new Error(
          (data.message || data.error || "Unable to process the file.") +
          missing +
          rowProblem
        );
      }

      setPreview(data);
      setActiveTab("overview");
    } catch (err) {
      setError(
        err instanceof TypeError
          ? `Cannot reach the backend at ${API}. Start the backend server.`
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendNotifications() {
    if (!preview?.batchId) {
      setError("Upload and validate an attendance file first.");
      return;
    }

    const selectedChannels = Object.keys(channels).filter(
      channel => channels[channel]
    );

    if (!selectedChannels.length) {
      setError("Select at least one notification channel.");
      return;
    }

    const message = [
      `Send notifications for ${preview.validCount} students?`,
      `Channels: ${selectedChannels.join(", ")}.`,
      "Emails will include the student's PDF report when available.",
      "This will contact real recipients."
    ].join("\n");

    if (!window.confirm(message)) return;

    setLoading(true);
    setError("");
    setReport(null);

    try {
      const response = await fetch(`${API}/api/attendance/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          batchId: preview.batchId,
          channels: selectedChannels,
          confirmSend: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Notification request failed."
        );
      }

      setReport(data);
      setDeliveryHistory(previous => [
        ...data.results,
        ...previous
      ]);
      setActiveTab("overview");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setFile(null);
    setPreview(null);
    setReport(null);
    setError("");
    setFilter("");
    setExpandedStudents({});

    const input = document.getElementById("attendance-file");
    if (input) input.value = "";
  }

  function toggleStudent(registrationNo) {
    setExpandedStudents(previous => ({
      ...previous,
      [registrationNo]: !previous[registrationNo]
    }));
  }

  function downloadCSV() {
    if (!reportData.length) return;

    const headers = [
      "Registration No",
      "Student Name",
      "Overall Attendance (%)",
      "Status",
      "Subject",
      "Subject Attendance (%)",
      "Parent Mobile",
      "Email Recipient"
    ];

    const escapeCSV = value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = [];

    for (const student of reportData) {
      const subjects = student.subjectAttendance;

      if (!subjects.length) {
        rows.push([
          student.registrationNo,
          student.studentName,
          student.attendancePercentage,
          student.status,
          "",
          "",
          student.parentMobile,
          student.emailRecipient
        ]);
      } else {
        for (const subject of subjects) {
          rows.push([
            student.registrationNo,
            student.studentName,
            student.attendancePercentage,
            student.status,
            subject.subject,
            subject.attendancePercentage,
            student.parentMobile,
            student.emailRecipient
          ]);
        }
      }
    }

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map(row => row.map(escapeCSV).join(","))
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `Attendance_Report_${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const goodCount = reportData.filter(
    student => student.attendancePercentage > 75
  ).length;

  const warningCount = reportData.filter(
    student =>
      student.attendancePercentage > 50 &&
      student.attendancePercentage <= 75
  ).length;

  const criticalCount = reportData.filter(
    student => student.attendancePercentage <= 50
  ).length;

  return (
    <div
      className={`app-shell theme-${theme}`}
      style={{
        minHeight: "100vh",
        background: theme === "dark" ? "#121212" : "#f8fafc",
        color: theme === "dark" ? "#e2e8f0" : "#0f172a"
      }}
    >
      <div
        style={{
          background: "#0c1e35",
          color: "#fff",
          padding: "10px 24px",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 13
        }}
      >
        <span>
          Shri Guru Gobind Singhji Institute of Engineering & Technology,
          Nanded
        </span>
        <span>Smart Attendance Console</span>
      </div>

      <header
        style={{
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
          background: theme === "dark" ? "#1e1e1e" : "#fff",
          borderBottom: "1px solid #e2e8f0"
        }}
      >
        <img
          src={collegeLogo}
          alt="Institute logo"
          style={{
            height: 58,
            maxWidth: "100%",
            objectFit: "contain"
          }}
        />

        <nav style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {["overview", "notifications", "reports"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                border: 0,
                padding: 8,
                cursor: "pointer",
                textTransform: "capitalize",
                background: "transparent",
                color: activeTab === tab ? "#3b82f6" : "inherit",
                fontWeight: 600
              }}
            >
              {tab}
            </button>
          ))}

          <button
            onClick={() =>
              setTheme(previous =>
                previous === "light" ? "dark" : "light"
              )
            }
            className="button button-secondary"
          >
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </nav>

        <span>
          {health?.status === "offline"
            ? "API disconnected"
            : health?.emailConfigured
              ? "Email configured"
              : "Email not configured"}
        </span>
      </header>

      <main style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: 14,
              marginBottom: 20,
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              gap: 12
            }}
          >
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <XCircle size={18} />
            </button>
          </div>
        )}

        {activeTab === "overview" && (
          <>
            <section style={{ marginBottom: 28 }}>
              <h1>
                Smart <em>Attendance</em>
              </h1>
              <p>
                Upload attendance, review subject-wise percentages, generate
                PDF reports, and send personalized parent notifications.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  marginTop: 20
                }}
              >
                <span><FileUp size={16} /> 1. Upload</span>
                <span><ClipboardCheck size={16} /> 2. Review</span>
                <span><Send size={16} /> 3. Send reports</span>
              </div>
            </section>

            <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
              <h2>
                <FileSpreadsheet
                  size={20}
                  style={{ verticalAlign: "middle", marginRight: 8 }}
                />
                Upload attendance file
              </h2>

              <p>
                Include registration number, student name, overall attendance,
                contact details, and one column for each subject.
              </p>

              <form onSubmit={uploadWorkbook}>
                <label
                  htmlFor="attendance-file"
                  style={{
                    display: "block",
                    padding: 24,
                    margin: "18px 0",
                    border: "2px dashed #94a3b8",
                    borderRadius: 12,
                    cursor: "pointer"
                  }}
                >
                  <FileUp size={28} />
                  <p>
                    <strong>
                      {file ? file.name : "Choose an Excel or CSV file"}
                    </strong>
                  </p>
                  <p>XLSX, XLS, or CSV · Maximum 10 MB</p>
                  <input
                    id="attendance-file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={event => {
                      setFile(event.target.files?.[0] || null);
                      setPreview(null);
                      setReport(null);
                      setError("");
                    }}
                    style={{ maxWidth: "100%" }}
                  />
                </label>

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={loading || !file}
                >
                  {loading ? (
                    <><RefreshCw size={16} /> Processing...</>
                  ) : (
                    <>Validate and preview <ArrowRight size={16} /></>
                  )}
                </button>
              </form>

              <div style={{ marginTop: 20 }}>
                <strong>Required columns</strong>
                <p>
                  Registration No., Student Name, Attendance % and at least
                  one contact field. Subject columns should contain numeric
                  attendance percentages from 0 to 100.
                </p>
              </div>
            </section>

            {preview && (
              <>
                <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
                  <h2>
                    <Users
                      size={20}
                      style={{ verticalAlign: "middle", marginRight: 8 }}
                    />
                    Attendance overview
                  </h2>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 14,
                      margin: "20px 0"
                    }}
                  >
                    {[
                      ["Valid students", preview.validCount],
                      ["Invalid rows", preview.invalidCount],
                      ["Good attendance", goodCount],
                      ["Needs improvement", warningCount],
                      ["Critical attendance", criticalCount]
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="stat-card"
                        style={{ padding: 16 }}
                      >
                        <span>{label}</span>
                        <h2>{value}</h2>
                      </div>
                    ))}
                  </div>

                  <p>
                    <ShieldCheck size={16} style={{ verticalAlign: "middle" }} />
                    {" "}SMTP: {health?.emailConfigured ? "Configured" : "Not configured"}
                    {" · "}
                    SMS: {health?.smsConfigured ? "Configured" : "Not configured"}
                  </p>

                  {preview.subjectColumns?.length > 0 && (
                    <p>
                      <strong>Detected subjects:</strong>{" "}
                      {preview.subjectColumns.join(", ")}
                    </p>
                  )}

                  {preview.rowErrors?.length > 0 && (
                    <details style={{ margin: "16px 0" }}>
                      <summary>
                        Review {preview.rowErrors.length} invalid rows
                      </summary>
                      {preview.rowErrors.map((row, index) => (
                        <p key={`${row.excelRow}-${index}`}>
                          Row {row.excelRow}:{" "}
                          {row.errors.join("; ")}
                        </p>
                      ))}
                    </details>
                  )}

                  <label
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      margin: "20px 0"
                    }}
                  >
                    <Search size={18} />
                    <input
                      value={filter}
                      onChange={event => setFilter(event.target.value)}
                      placeholder="Search student, registration or contact"
                      style={{ padding: 10, flex: 1, minWidth: 0 }}
                    />
                  </label>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th align="left">Student</th>
                          <th align="left">Registration No.</th>
                          <th align="left">Overall attendance</th>
                          <th align="left">Status</th>
                          <th align="left">Subjects</th>
                          <th align="left">PDF</th>
                          <th align="left">Details</th>
                        </tr>
                      </thead>

                      <tbody>
                        {visibleRecords.map((student, index) => {
                          const subjects = student.subjectAttendance || [];
                          const status = getAttendanceStatus(
                            student.attendancePercentage
                          );

                          return (
                            <>
                              <tr
                                key={student.registrationNo || index}
                                style={{ borderTop: "1px solid #cbd5e1" }}
                              >
                                <td>{student.studentName}</td>
                                <td>{student.registrationNo}</td>
                                <td>{student.attendancePercentage}%</td>
                                <td>
                                  <span
                                    className={`result-pill ${status === "Good"
                                        ? "submitted"
                                        : status === "Warning"
                                          ? "skipped"
                                          : "failed"
                                      }`}
                                  >
                                    {status}
                                  </span>
                                </td>
                                <td>{subjects.length}</td>
                                <td>
                                  {student.attendancePdfBase64 ? (
                                    <span>
                                      <CheckCircle2
                                        size={16}
                                        style={{ verticalAlign: "middle" }}
                                      /> Available
                                    </span>
                                  ) : (
                                    <span>Unavailable</span>
                                  )}
                                </td>
                                <td>
                                  <button
                                    className="button button-secondary"
                                    onClick={() =>
                                      toggleStudent(student.registrationNo)
                                    }
                                  >
                                    {expandedStudents[student.registrationNo]
                                      ? "Hide"
                                      : "View"}{" "}
                                    <ChevronDown size={14} />
                                  </button>
                                </td>
                              </tr>

                              {expandedStudents[student.registrationNo] && (
                                <tr key={`${student.registrationNo}-details`}>
                                  <td colSpan={7}>
                                    <div style={{ padding: 16 }}>
                                      <h3>Subject-wise attendance</h3>

                                      {subjects.length ? (
                                        <table
                                          style={{
                                            width: "100%",
                                            maxWidth: 600,
                                            borderCollapse: "collapse"
                                          }}
                                        >
                                          <thead>
                                            <tr>
                                              <th align="left">Subject</th>
                                              <th align="left">Attendance</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {subjects.map((subject, i) => (
                                              <tr
                                                key={`${subject.subject}-${i}`}
                                                style={{
                                                  borderTop: "1px solid #cbd5e1"
                                                }}
                                              >
                                                <td>{subject.subject}</td>
                                                <td>
                                                  {subject.attendanceDisplay ??
                                                    `${subject.attendancePercentage}%`}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      ) : (
                                        <p>No subject data is available.</p>
                                      )}

                                      <p>
                                        <strong>Email:</strong>{" "}
                                        {student.emailRecipient || "Not provided"}
                                      </p>

                                      <p>
                                        <strong>Email subject:</strong>{" "}
                                        {student.emailSubject}
                                      </p>

                                      <pre
                                        style={{
                                          whiteSpace: "pre-wrap",
                                          overflowWrap: "anywhere",
                                          fontFamily: "inherit"
                                        }}
                                      >
                                        {student.message ||
                                          student.emailMessage}
                                      </pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button
                    className="button button-secondary"
                    style={{ marginTop: 20 }}
                    onClick={() => setShowMessages(previous => !previous)}
                  >
                    {showMessages ? "Hide message examples" : "Preview message examples"}
                  </button>

                  {showMessages && (
                    <div style={{ marginTop: 16 }}>
                      {["Good", "Warning", "Critical"].map(category => {
                        const student = preview.records.find(
                          record =>
                            getAttendanceStatus(record.attendancePercentage) ===
                            category
                        );

                        if (!student) return null;

                        return (
                          <div
                            key={category}
                            style={{
                              padding: 16,
                              border: "1px solid #cbd5e1",
                              borderRadius: 8,
                              marginBottom: 12
                            }}
                          >
                            <strong>{category} attendance example</strong>
                            <p>{student.emailSubject}</p>
                            <p style={{ whiteSpace: "pre-wrap" }}>
                              {student.message || student.emailMessage}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
                  <h2>Notification channels</h2>
                  <p>
                    Confirm the recipients and review the preview before sending.
                  </p>

                  <label style={{ display: "block", margin: "12px 0" }}>
                    <input
                      type="checkbox"
                      checked={channels.email}
                      onChange={event =>
                        setChannels(previous => ({
                          ...previous,
                          email: event.target.checked
                        }))
                      }
                    />
                    {" "}
                    <Mail size={16} style={{ verticalAlign: "middle" }} />
                    {" "}Email with individual PDF attachment
                  </label>

                  <label style={{ display: "block", margin: "12px 0" }}>
                    <input
                      type="checkbox"
                      checked={channels.sms}
                      onChange={event =>
                        setChannels(previous => ({
                          ...previous,
                          sms: event.target.checked
                        }))
                      }
                    />
                    {" "}
                    <MessageSquareText
                      size={16}
                      style={{ verticalAlign: "middle" }}
                    />
                    {" "}SMS
                  </label>

                  <button
                    className="button button-primary"
                    disabled={
                      loading ||
                      !(channels.email || channels.sms) ||
                      !preview.records.length
                    }
                    onClick={sendNotifications}
                  >
                    {loading ? (
                      <><RefreshCw size={16} /> Sending...</>
                    ) : (
                      <>Confirm and send <Send size={16} /></>
                    )}
                  </button>
                </section>
              </>
            )}

            {report && (
              <section className="panel" style={{ padding: 24 }}>
                <h2>Notification delivery report</h2>

                <p>
                  Attempts: {report.attempted} · Submitted: {report.submitted}
                  {" · "}Failed: {report.failed} · Skipped: {report.skipped}
                </p>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th align="left">Student</th>
                        <th align="left">Channel</th>
                        <th align="left">Recipient</th>
                        <th align="left">Status</th>
                        <th align="left">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.results.map((item, index) => (
                        <tr key={`${item.registrationNo}-${index}`}>
                          <td>
                            {item.studentName}
                            <br />
                            {item.registrationNo}
                          </td>
                          <td>{item.channel.toUpperCase()}</td>
                          <td>{item.recipient || "—"}</td>
                          <td>{item.status}</td>
                          <td>{item.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  className="button button-secondary"
                  style={{ marginTop: 20 }}
                  onClick={resetAll}
                >
                  Start a new upload
                </button>
              </section>
            )}
          </>
        )}

        {activeTab === "notifications" && (
          <section className="panel" style={{ padding: 24 }}>
            <h2>
              <BellRing
                size={20}
                style={{ verticalAlign: "middle", marginRight: 8 }}
              />
              Notification history
            </h2>

            {deliveryHistory.length === 0 ? (
              <p>No notification attempts are available in this session.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th align="left">Student</th>
                      <th align="left">Channel</th>
                      <th align="left">Recipient</th>
                      <th align="left">Status</th>
                      <th align="left">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryHistory.map((item, index) => (
                      <tr key={`${item.registrationNo}-${index}`}>
                        <td>{item.studentName}</td>
                        <td>{item.channel}</td>
                        <td>{item.recipient || "—"}</td>
                        <td>{item.status}</td>
                        <td>{item.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === "reports" && (
          <section className="panel" style={{ padding: 24 }}>
            <h2>
              <FileText
                size={20}
                style={{ verticalAlign: "middle", marginRight: 8 }}
              />
              Attendance reports
            </h2>

            {!reportData.length ? (
              <p>
                Upload an attendance sheet in the Overview tab to view
                student and subject-wise reports.
              </p>
            ) : (
              <>
                <p>
                  {reportData.length} students · {goodCount} good ·{" "}
                  {warningCount} need improvement · {criticalCount} critical
                </p>

                <button
                  className="button button-primary"
                  onClick={downloadCSV}
                >
                  <Download size={16} /> Download subject-wise CSV
                </button>

                <div style={{ overflowX: "auto", marginTop: 20 }}>
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th align="left">Registration No.</th>
                        <th align="left">Student</th>
                        <th align="left">Overall attendance</th>
                        <th align="left">Status</th>
                        <th align="left">Subject count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map(student => (
                        <tr key={student.registrationNo}>
                          <td>{student.registrationNo}</td>
                          <td>{student.studentName}</td>
                          <td>{student.attendancePercentage}%</td>
                          <td>{student.status}</td>
                          <td>{student.subjectAttendance.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </main>

      <footer
        style={{
          padding: 24,
          textAlign: "center",
          borderTop: "1px solid #cbd5e1"
        }}
      >
        <p>
          Shri Guru Gobind Singhji Institute of Engineering & Technology
        </p>
        <small>Smart Attendance Console · Review before sending notifications</small>
      </footer>
    </div>
  );
}

export default App;
