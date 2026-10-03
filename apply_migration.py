import psycopg2
import sys

db_url = "postgresql://postgres:Ravi%408639158448@db.zwszhbesiuajvcnvnaqd.supabase.co:5432/postgres"
try:
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cursor = conn.cursor()
    
    with open('supabase/migrations/012_finance_ledger.sql', 'r') as f:
        sql = f.read()
    
    cursor.execute(sql)
    print("Migration applied successfully.")
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
