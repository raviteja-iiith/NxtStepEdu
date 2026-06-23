import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Replace stat cards grid
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"]repeat\(4,\s*1fr\)['\"],\s*gap:\s*1[46]6?\s*\}\}",
        r'className="stat-cards-container"',
        content
    )
    
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"]repeat\(3,\s*1fr\)['\"],\s*gap:\s*1[46]6?\s*\}\}",
        r'className="three-col-stats"',
        content
    )

    # Replace bottom grid
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"]1fr 280px['\"],\s*gap:\s*16\s*\}\}",
        r'className="bottom-grid-container"',
        content
    )

    # Replace wrapper containers
    content = re.sub(
        r"style=\{\{\s*maxWidth:\s*1[12]00,\s*margin:\s*['\"]0 auto['\"],\s*display:\s*['\"]flex['\"],\s*flexDirection:\s*['\"]column['\"],\s*gap:\s*24\s*\}\}",
        r'className="dashboard-container"',
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
