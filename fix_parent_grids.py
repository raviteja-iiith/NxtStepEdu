import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Stat cards grid
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"]repeat\([34],\s*1fr\)['\"],\s*gap:\s*[0-9]+\s*\}\}",
        r'className="stat-cards-container"',
        content
    )

    # 2fr 1fr or 1fr 2fr layouts
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]grid['\"],\s*gridTemplateColumns:\s*['\"](1fr 2fr|2fr 1fr|1fr 280px)['\"],\s*gap:\s*[0-9]+\s*\}\}",
        r'className="bottom-grid-container"',
        content
    )

    # Max width 1100 flex column wrappers
    content = re.sub(
        r"style=\{\{\s*maxWidth:\s*1[12]00,\s*margin:\s*['\"]0 auto['\"],\s*display:\s*['\"]flex['\"],\s*flexDirection:\s*['\"]column['\"],\s*gap:\s*[0-9]+\s*\}\}",
        r'className="dashboard-container"',
        content
    )

    # Header rows with flex-wrap
    content = re.sub(
        r"style=\{\{\s*display:\s*['\"]flex['\"],\s*alignItems:\s*['\"](center|flex-end|flex-start)['\"],\s*justifyContent:\s*['\"]space-between['\"],\s*gap:\s*[0-9]+,\s*flexWrap:\s*['\"]wrap['\"]\s*\}\}",
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
