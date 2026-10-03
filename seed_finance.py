import psycopg2
import sys
import random
from datetime import datetime, timedelta

db_url = "postgresql://postgres:Ravi%408639158448@db.zwszhbesiuajvcnvnaqd.supabase.co:5432/postgres"

def run():
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Get founders
        cursor.execute("SELECT id, name FROM founder_equity;")
        founders = {row[1]: row[0] for row in cursor.fetchall()}
        
        # Get categories
        cursor.execute("SELECT id, name, type FROM finance_categories;")
        categories = {row[1]: {'id': row[0], 'type': row[2]} for row in cursor.fetchall()}
        
        # Clear existing transactions to avoid duplicates during dev
        cursor.execute("DELETE FROM finance_transactions;")
        
        # Insert 6 months of data
        start_date = datetime.now() - timedelta(days=180)
        
        for i in range(180):
            current_date = start_date + timedelta(days=i)
            # Add some random transactions
            # 1. Income (Subscriptions)
            if random.random() < 0.2:
                cat = categories['Subscription']
                cursor.execute("""
                    INSERT INTO finance_transactions (txn_date, type, category_id, category_name, party_name, amount, from_account, to_account)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (current_date, cat['type'], cat['id'], 'Subscription', f"School {random.randint(1,10)}", random.randint(10000, 150000), 'School', 'Company A/C'))
                
            # 2. Expense
            if random.random() < 0.3:
                exp_names = ['Server & Infra', 'Marketing', 'Office & Admin', 'Misc / Other']
                cat_name = random.choice(exp_names)
                cat = categories[cat_name]
                cursor.execute("""
                    INSERT INTO finance_transactions (txn_date, type, category_id, category_name, party_name, amount, from_account, to_account)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (current_date, cat['type'], cat['id'], cat_name, 'Vendor', random.randint(5000, 50000), 'Company A/C', 'Vendor'))
                
            # 3. Monthly Payroll
            if current_date.day == 28:
                cat = categories['Employee Salaries']
                cursor.execute("""
                    INSERT INTO finance_transactions (txn_date, type, category_id, category_name, party_name, amount, from_account, to_account)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (current_date, cat['type'], cat['id'], 'Employee Salaries', 'All Employees', 560000, 'Company A/C', 'Employees'))
                
                # Founder draw
                for fname, fid in founders.items():
                    cat = categories['Founder Draw']
                    cursor.execute("""
                        INSERT INTO finance_transactions (txn_date, type, category_id, category_name, party_name, party_user_id, amount, from_account, to_account)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (current_date, cat['type'], cat['id'], 'Founder Draw', fname, None, random.randint(40000, 65000), 'Company A/C', f"{fname} - Personal"))
        
        print("Data seeded successfully.")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

run()
