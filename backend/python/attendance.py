"""Read an Excel workbook from stdin and emit validated JSON to stdout.

Node invokes this script as:
  python attendance.py preview original_filename.xlsx < workbook-bytes
No database or persistent student-data files are used.
"""
import json
import math
import re
import sys
from io import BytesIO
from typing import Any

import pandas as pd

REQUIRED_ALIASES = {
    "registrationNo": [
        "registration no", "registration number", "reg no", "reg number",
        "registration_no", "registration id", "enrollment no", "enrolment no"
    ],
    "studentName": [
        "student name", "name of student", "name", "student_name"
    ],
    "attendancePercentage": [
        "attendance percentage", "attendance %", "attendance",
        "attendance_percentage", "percentage"
    ],
}
OPTIONAL_ALIASES = {
    "parentMobile": [
        "parent mobile no", "parent mobile", "parent phone", "parent phone no",
        "parent_mobile", "parent mobile number", "parent contact", "mobile no",
        "mobile number", "mobile", "phone", "phone no", "contact no"
    ],
    "parentEmail": ["parent email", "parent email id", "parent_email"],
    "studentEmail": ["student email", "student email id", "student_email"],
}

def normalize_header(value: Any) -> str:
    value = str(value).strip().lower()
    value = value.replace("%", " percent ")
    value = re.sub(r"[._\-/]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()

def text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return str(int(value))
    return str(value).strip()

def normalize_phone(value: str) -> str:
    value = re.sub(r"[\s().-]", "", value)
    if value.isdigit() and len(value) == 10:
        value = "+91" + value
    return value

def valid_phone(value: str) -> bool:
    return bool(re.fullmatch(r"\+[1-9]\d{7,14}", value))

def valid_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value))

def find_columns(df: pd.DataFrame):
    lookup = {}
    for column in df.columns:
        lookup[normalize_header(column)] = column
    found = {}
    missing = []
    all_aliases = {**REQUIRED_ALIASES, **OPTIONAL_ALIASES}
    for field, aliases in all_aliases.items():
        normalized_aliases = [normalize_header(a) for a in aliases]
        matched = next((lookup[a] for a in normalized_aliases if a in lookup), None)
        if matched is not None:
            found[field] = matched
        elif field in REQUIRED_ALIASES:
            missing.append(field)
    return found, missing

def emit_error(message: str, row_errors=None, missing_columns=None, recognized_columns=None):
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
        emit_error("Unsupported Python command. Expected: preview.")
    original_name = sys.argv[2] if len(sys.argv) > 2 else "attendance.xlsx"
    raw = sys.stdin.buffer.read()
    if not raw:
        emit_error("The uploaded workbook is empty.")
    try:
        suffix = original_name.lower().rsplit(".", 1)[-1]
        engine = "xlrd" if suffix == "xls" else "openpyxl"
        df = pd.read_excel(BytesIO(raw), dtype=object, engine=engine)
    except Exception:
        emit_error("Python could not read this workbook. Check the file format and Python dependencies.")
    if df.empty:
        emit_error("The workbook contains no student rows.")
    df = df.dropna(how="all")
    if len(df) > 5000:
        emit_error("This starter project accepts a maximum of 5,000 rows per upload.")

    columns, missing = find_columns(df)
    if "parentMobile" not in columns and "parentEmail" not in columns and "studentEmail" not in columns:
        emit_error(
            "The workbook needs at least one contact column: Parent Email, Student Email or Parent Mobile No.",
            missing_columns=["parentEmail or parentMobile"],
            recognized_columns=[str(c) for c in df.columns]
        )
    if missing:
        emit_error(
            "Required Excel columns are missing. Check the workbook headings.",
            missing_columns=missing,
            recognized_columns=[str(c) for c in df.columns]
        )

    records = []
    row_errors = []
    seen = set()
    for index, source in df.iterrows():
        excel_row = int(index) + 2
        item = {field: text(source[column]) for field, column in columns.items()}
        if not any(item.values()):
            continue

        reg = item.get("registrationNo", "")
        name = item.get("studentName", "")
        phone = normalize_phone(item.get("parentMobile", ""))
        parent_email = item.get("parentEmail", "")
        student_email = item.get("studentEmail", "")
        attendance_raw = item.get("attendancePercentage", "").replace("%", "").strip()
        errors = []

        if not reg:
            errors.append("Registration number is missing")
        if not name:
            errors.append("Student name is missing")
        if not phone and not parent_email and not student_email:
            errors.append("No contact provided (need a parent email, student email or parent mobile)")
        elif phone and not valid_phone(phone):
            errors.append("Parent mobile must include country code, e.g. +919876543210")
        try:
            attendance = float(attendance_raw)
            if not math.isfinite(attendance) or not 0 <= attendance <= 100:
                raise ValueError()
        except ValueError:
            attendance = None
            errors.append("Attendance must be a number between 0 and 100")

        if parent_email and not valid_email(parent_email):
            errors.append("Parent email format is invalid")
        if student_email and not valid_email(student_email):
            errors.append("Student email format is invalid")
        if reg and reg in seen:
            errors.append("Duplicate registration number")
        if reg:
            seen.add(reg)

        if errors:
            row_errors.append({
                "excelRow": excel_row,
                "registrationNo": reg,
                "studentName": name,
                "errors": errors
            })
            continue

        records.append({
            "excelRow": excel_row,
            "registrationNo": reg,
            "studentName": name,
            "parentMobile": phone,
            "parentEmail": parent_email,
            "studentEmail": student_email,
            "emailRecipient": parent_email or student_email,
            "attendancePercentage": attendance
        })

    print(json.dumps({
        "filename": original_name,
        "records": records,
        "rowErrors": row_errors,
        "validCount": len(records),
        "invalidCount": len(row_errors)
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
