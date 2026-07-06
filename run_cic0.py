import os
import json
from datetime import datetime, timezone, timedelta

def read_sap_file(filepath):
    encodings = ['utf-8', 'utf-8-sig', 'tis-620', 'cp874']
    for enc in encodings:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                return f.read()
        except UnicodeDecodeError:
            continue
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()

def parse_float(val):
    try:
        return float(val.replace(',', '').strip())
    except ValueError:
        return 0.0

def main():
    file_cic0 = "cic0.txt"
    output_file = os.path.join("js", "data.js")

    if not os.path.exists(file_cic0):
        print(f"❌ Error: ไม่พบไฟล์ {file_cic0}")
        return

    print(f"⏳ เริ่มประมวลผลไฟล์: {file_cic0} ...")

    content = read_sap_file(file_cic0)

    pea_records = []
    units = []  # preserve order of first appearance
    seen_units = set()

    for line in content.splitlines():
        line = line.strip()
        if not line.startswith('|') or line.startswith('|-'):
            continue
        if 'หมายเลข PEA' in line:  # table header row
            continue

        columns = [col.strip() for col in line.split('|')[1:-1]]
        if len(columns) < 8:
            continue

        unit_name = columns[1]
        if unit_name not in seen_units:
            seen_units.add(unit_name)
            units.append(unit_name)

        pea_records.append({
            "pea": columns[0],
            "unit": unit_name,
            "customerName": columns[2],
            "address": columns[3],
            "cutDate": columns[4],
            "daysCut": int(columns[5]) if columns[5].isdigit() else 0,
            "debt": parse_float(columns[6]),
            "deposit": parse_float(columns[7]),
        })

    tz_th = timezone(timedelta(hours=7))
    update_time = datetime.now(tz_th).strftime("%d/%m/%Y เวลา %H:%M น.")

    os.makedirs("js", exist_ok=True)

    js_content = f"""// ไฟล์นี้ถูกสร้างอัตโนมัติจาก Python (ห้ามแก้ไขด้วยมือ)
window.lastUpdated = "{update_time}";
window.unitList = {json.dumps(units, ensure_ascii=False)};
window.peaData = {json.dumps(pea_records, ensure_ascii=False)};
"""

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"🎉 สำเร็จ! สร้างไฟล์ {output_file} แล้ว ({len(pea_records)} รายการ, {len(units)} หน่วยงาน)")

if __name__ == "__main__":
    main()
