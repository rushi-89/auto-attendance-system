
import base64
import json
import math
import re
import sys
from io import BytesIO
from typing import Any

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


REQUIRED_ALIASES = {
    "registrationNo": [
    "registration no",
    "registration number",
    "reg no",
    "reg number",
    "registration id",
    "enrollment no",
    "enrolment no",
    "registrationNo",
],

"studentName": [
    "student name",
    "name of student",
    "name",
    "studentName",
],

"attendancePercentage": [
    "attendance percentage",
    "attendance %",
    "attendance",
    "percentage",
    "overall attendance",
    "overall attendance percentage",
    "attendancePercentage",
],
}

OPTIONAL_ALIASES = {
    "parentMobile": [
        "parentMobile",
        "parent mobile no",
        "parent mobile",
        "parent phone",
        "parent phone no",
        "parent mobile number",
        "parent contact",
        "mobile no",
        "mobile number",
        "mobile",
        "phone",
        "phone no",
        "contact no",
    ],
    "parentEmail": [
        "parentEmail",
        "parent email",
        "parent email id",
    ],
    "studentEmail": [
        "student email",
        "student email id",
    ],
}


def normalize_header(value: Any) -> str:
    value = str(value).strip().lower()
    value = value.replace("%", " percent ")
    value = re.sub(r"[./_\\-]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def text(value: Any) -> str:
    if value is None:
        return ""

    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass

    if isinstance(value, float) and math.isfinite(value):
        if value.is_integer():
            return str(int(value))

    return str(value).strip()


def parse_percentage(value: Any):
    """Parse a numeric attendance percentage between 0 and 100."""
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    if isinstance(value, str):
        value = value.strip().replace(",", "")

        if not value:
            return None

        value = value.removesuffix("%").strip()

    try:
        number = float(value)
    except (ValueError, TypeError):
        return None

    if not math.isfinite(number) or not 0 <= number <= 100:
        return None

    return round(number, 2)


def normalize_phone(value: str) -> str:
    value = re.sub(r"[\s().-]", "", value)

    if value.startswith("0091"):
        value = "+91" + value[4:]
    elif value.startswith("91") and len(value) == 12 and value.isdigit():
        value = "+" + value
    elif value.isdigit() and len(value) == 10:
        value = "+91" + value

    return value


def valid_phone(value: str) -> bool:
    return bool(re.fullmatch(r"\+[1-9]\d{7,14}", value))


def valid_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value))


def find_columns(df):
    lookup = {}

    for column in df.columns:
        normalized = normalize_header(column)

        if normalized not in lookup:
            lookup[normalized] = column

    found = {}
    missing = []

    all_aliases = {
        **REQUIRED_ALIASES,
        **OPTIONAL_ALIASES,
    }

    for field, aliases in all_aliases.items():
        matched = next(
            (
                lookup[normalize_header(alias)]
                for alias in aliases
                if normalize_header(alias) in lookup
            ),
            None,
        )

        if matched is not None:
            found[field] = matched
        elif field in REQUIRED_ALIASES:
            missing.append(field)

    return found, missing


def attendance_category(attendance: float) -> str:
    if attendance > 75:
        return "Good"

    if attendance > 50:
        return "Warning"

    return "Critical"


def generate_messages(name: str, attendance: float):
    category = attendance_category(attendance)

    if category == "Good":
        subject = f"Attendance Update: Good Standing ({attendance:g}%)"

        message = (
            "Dear Parent/Guardian,\n\n"
            f"{name} currently has {attendance:g}% overall attendance. "
            "Your ward has good attendance. Please encourage them "
            "to maintain this performance and continue attending "
            "classes regularly.\n\n"
            "Please find the attached subject-wise attendance report.\n\n"
            "Regards,\nCollege/Department"
        )

        sms_message = (
            f"Attendance update: {name} has {attendance:g}% attendance. "
            "Good standing. Please maintain regular attendance."
        )

    elif category == "Warning":
        subject = (
            f"Attendance Warning: Improvement Required ({attendance:g}%)"
        )

        message = (
            "Dear Parent/Guardian,\n\n"
            f"{name} currently has {attendance:g}% overall attendance, "
            "which is below the required 75% level. Your ward's "
            "attendance needs improvement. Please ensure regular "
            "attendance and help them improve promptly.\n\n"
            "Please find the attached subject-wise attendance report.\n\n"
            "Regards,\nCollege/Department"
        )

        sms_message = (
            f"Attendance warning: {name} has {attendance:g}% attendance, "
            "below 75%. Please ensure regular class attendance."
        )

    else:
        subject = (
            f"CRITICAL Attendance Alert: Immediate Attention Required "
            f"({attendance:g}%)"
        )

        message = (
            "Dear Parent/Guardian,\n\n"
            f"{name} currently has only {attendance:g}% overall "
            "attendance. This is a critical attendance concern. "
            "Immediate improvement is required. Please contact the "
            "institution or Head of Department to discuss the "
            "necessary corrective steps.\n\n"
            "Please find the attached subject-wise attendance report.\n\n"
            "Regards,\nCollege/Department"
        )

        sms_message = (
            f"CRITICAL attendance alert: {name} has only "
            f"{attendance:g}% attendance. Please contact the institution."
        )

    return subject, message, sms_message, category


def detect_subject_columns(df, known_columns):
    """
    Identify columns that contain numeric attendance percentages.

    Known identity, contact, and overall-attendance columns are excluded.
    A column is treated as a subject column only when every non-empty
    value can be parsed as a percentage from 0 through 100.
    """
    excluded = {
        normalize_header(column)
        for column in known_columns.values()
    }

    subject_columns = []

    for column in df.columns:
        if normalize_header(column) in excluded:
            continue

        header = normalize_header(column)

        if any(
            header == normalize_header(alias)
            for aliases in (
                REQUIRED_ALIASES,
                OPTIONAL_ALIASES,
            )
            for alias_list in aliases.values()
            for alias in alias_list
        ):
            continue

        values = [
            value
            for value in df[column].tolist()
            if text(value)
        ]

        if not values:
            continue

        parsed = [parse_percentage(value) for value in values]

        if all(value is not None for value in parsed):
            subject_columns.append(column)

    return subject_columns


def build_subject_attendance(row, subject_columns):
    subjects = []

    for column in subject_columns:
        value = parse_percentage(row[column])

        if value is None:
            continue

        subjects.append({
            "subject": str(column).strip(),
            "attendancePercentage": value,
            "attendanceDisplay": f"{value:g}%",
        })

    return subjects


def generate_attendance_pdf(
    name,
    registration_no,
    overall_attendance,
    category,
    subjects,
):
    """Create a student's individual PDF report in memory."""
    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Attendance Report - {registration_no}",
        author="College/Department",
    )

    styles = getSampleStyleSheet()
    story = []

    story.append(
        Paragraph("STUDENT ATTENDANCE REPORT", styles["Title"])
    )
    story.append(Spacer(1, 8 * mm))

    student_data = [
        ["Student Name", name],
        ["Registration Number", registration_no],
        ["Overall Attendance", f"{overall_attendance:g}%"],
        ["Attendance Status", category],
    ]

    student_table = Table(
        student_data,
        colWidths=[48 * mm, 112 * mm],
    )

    student_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E8EEF7")),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#202938")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ])
    )

    story.append(student_table)
    story.append(Spacer(1, 10 * mm))
    story.append(
        Paragraph("Subject-wise Attendance", styles["Heading2"])
    )
    story.append(Spacer(1, 3 * mm))

    table_data = [
        ["Subject", "Subject-wise Attendance"]
    ]

    for item in subjects:
        table_data.append([
            item["subject"],
            item["attendanceDisplay"],
        ])

    if not subjects:
        table_data.append([
            "No subject data available",
            "N/A",
        ])

    subject_table = Table(
        table_data,
        colWidths=[105 * mm, 55 * mm],
        repeatRows=1,
    )

    subject_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#23436B")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [
                colors.white,
                colors.HexColor("#F3F6FA"),
            ]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ])
    )

    story.append(subject_table)
    story.append(Spacer(1, 10 * mm))
    story.append(
        Paragraph(
            "This report is based on the attendance data supplied "
            "by the institution.",
            styles["Normal"],
        )
    )

    document.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    return pdf_bytes


def emit_error(
    message,
    row_errors=None,
    missing_columns=None,
    recognized_columns=None,
):
    result = {"error": message}

    if row_errors is not None:
        result["rowErrors"] = row_errors

    if missing_columns is not None:
        result["missingColumns"] = missing_columns

    if recognized_columns is not None:
        result["recognizedColumns"] = recognized_columns

    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)


def main():
    if len(sys.argv) < 2 or sys.argv[1] != "preview":
        emit_error("Unsupported command. Expected: preview.")

    original_name = (
        sys.argv[2] if len(sys.argv) > 2 else "attendance.xlsx"
    )

    raw = sys.stdin.buffer.read()

    if not raw:
        emit_error("The uploaded file is empty.")

    try:
        suffix = original_name.lower().rsplit(".", 1)[-1]

        if suffix == "csv":
            df = pd.read_csv(
                BytesIO(raw),
                dtype=object,
                keep_default_na=True,
            )
        elif suffix in ("xlsx", "xls"):
            engine = "xlrd" if suffix == "xls" else "openpyxl"

            df = pd.read_excel(
                BytesIO(raw),
                dtype=object,
                engine=engine,
            )
        else:
            emit_error("Please upload a CSV, XLSX, or XLS file.")

    except Exception as exc:
        emit_error(
            "Could not read the file. Check its format and "
            f"dependencies. Details: {str(exc)}"
        )

    df = df.dropna(how="all")

    if df.empty:
        emit_error("The file contains no student rows.")

    if len(df) > 5000:
        emit_error("A maximum of 5,000 rows is allowed per upload.")

    columns, missing = find_columns(df)
    recognized = [str(column) for column in df.columns]

    if missing:
        emit_error(
            "Required student columns are missing.",
            missing_columns=missing,
            recognized_columns=recognized,
        )

    if not any(
        field in columns
        for field in ("parentMobile", "parentEmail", "studentEmail")
    ):
        emit_error(
            "Add at least one contact column: Parent Email, "
            "Student Email, or Parent Mobile No.",
            missing_columns=[
                "parentEmail or studentEmail or parentMobile"
            ],
            recognized_columns=recognized,
        )

    subject_columns = detect_subject_columns(df, columns)

    if not subject_columns:
        emit_error(
            "No subject-wise attendance columns were detected. "
            "Include a separate numeric attendance percentage "
            "column for each subject.",
            recognized_columns=recognized,
        )

    records = []
    row_errors = []
    seen = set()

    for index, source in df.iterrows():
        excel_row = int(index) + 2

        reg = text(source[columns["registrationNo"]])
        name = text(source[columns["studentName"]])

        phone = normalize_phone(
            text(source[columns["parentMobile"]])
            if "parentMobile" in columns
            else ""
        )

        parent_email = (
            text(source[columns["parentEmail"]])
            if "parentEmail" in columns
            else ""
        )

        student_email = (
            text(source[columns["studentEmail"]])
            if "studentEmail" in columns
            else ""
        )

        attendance = parse_percentage(
            source[columns["attendancePercentage"]]
        )

        errors = []

        if not reg:
            errors.append("Registration number is missing")

        if not name:
            errors.append("Student name is missing")

        if not phone and not parent_email and not student_email:
            errors.append("No contact details provided")

        if phone and not valid_phone(phone):
            errors.append(
                "Parent mobile must include a valid country code, "
                "for example +919876543210"
            )

        if attendance is None:
            errors.append(
                "Overall attendance must be between 0 and 100"
            )

        if parent_email and not valid_email(parent_email):
            errors.append("Parent email format is invalid")

        if student_email and not valid_email(student_email):
            errors.append("Student email format is invalid")

        if reg and reg in seen:
            errors.append("Duplicate registration number")

        subjects = build_subject_attendance(
            source,
            subject_columns,
        )

        if not subjects:
            errors.append(
                "No valid subject-wise attendance values found"
            )

        if reg:
            seen.add(reg)

        if errors:
            row_errors.append({
                "excelRow": excel_row,
                "registrationNo": reg,
                "studentName": name,
                "errors": errors,
            })
            continue

        (
            email_subject,
            email_message,
            sms_message,
            category,
        ) = generate_messages(name, attendance)

        pdf_bytes = generate_attendance_pdf(
            name,
            reg,
            attendance,
            category,
            subjects,
        )

        records.append({
            "excelRow": excel_row,
            "registrationNo": reg,
            "studentName": name,
            "parentMobile": phone,
            "parentEmail": parent_email,
            "studentEmail": student_email,
            "emailRecipient": parent_email or student_email,
            "attendancePercentage": attendance,
            "attendanceCategory": category,
            "emailSubject": email_subject,
            "emailMessage": email_message,
            "smsMessage": sms_message,
            "subjectAttendance": subjects,
            "attendancePdfFilename": f"attendance_{reg}.pdf",
            "attendancePdfBase64": base64.b64encode(
                pdf_bytes
            ).decode("ascii"),
        })

    print(json.dumps({
        "filename": original_name,
        "records": records,
        "rowErrors": row_errors,
        "validCount": len(records),
        "invalidCount": len(row_errors),
        "subjectColumns": [str(column) for column in subject_columns],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
