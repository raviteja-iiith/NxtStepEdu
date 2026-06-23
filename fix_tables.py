import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Student list headers
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"]2fr 140px 1fr 80px 90px 180px['\"],\s*padding:\s*['\"]1[24]px 20px['\"],\s*background:\s*['\"]#F8FAFC['\"],\s*borderBottom:\s*['\"]1px solid #[A-F0-9]+['\"]\s*\}\}",
        r'className="student-list-grid header-row" style={{ padding: "12px 20px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}',
        content
    )

    # Student list rows (need to handle dynamic borders)
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"]2fr 140px 1fr 80px 90px 180px['\"],\s*padding:\s*['\"]14px 20px['\"],\s*borderBottom:\s*([^,]+),\s*alignItems:\s*['\"]center['\"]\s*\}\}",
        r'className="student-list-grid" style={{ padding: "14px 20px", borderBottom: \1, alignItems: "center" }}',
        content
    )

    # Teacher list headers
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"]2fr 110px 1.2fr 100px 140px['\"],\s*padding:\s*['\"]1[24]px 20px['\"],\s*background:\s*['\"]#F8FAFC['\"],\s*borderBottom:\s*['\"]1px solid #[A-F0-9]+['\"]\s*\}\}",
        r'className="teacher-list-grid header-row" style={{ padding: "12px 20px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}',
        content
    )

    # Teacher list rows
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"]2fr 110px 1.2fr 100px 140px['\"],\s*padding:\s*['\"]14px 20px['\"],\s*borderBottom:\s*([^,]+),\s*alignItems:\s*['\"]center['\"]\s*\}\}",
        r'className="teacher-list-grid" style={{ padding: "14px 20px", borderBottom: \1, alignItems: "center" }}',
        content
    )

    # Banner header container
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]flex['\"],\s*alignItems:\s*['\"]flex-start['\"],\s*justifyContent:\s*['\"]space-between['\"],\s*gap:\s*16,\s*flexWrap:\s*['\"]wrap['\"]\s*\}\}",
        r'className="page-header-row"',
        content
    )

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('apps/web/src/app'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))
