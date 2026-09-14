"""Check existing bot_logs schema in Supabase."""
import json
import urllib.request

PROJECT_REF = "ednvxuhkvfbjygumtfnq"
MGMT_TOKEN = "sbp_257d8128ed389368a0e6ecb75cb403df4b1184d7"

sql = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bot_logs' AND table_schema = 'public';"
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
    headers={"Authorization": f"Bearer {MGMT_TOKEN}", "Content-Type": "application/json"},
    data=json.dumps({"query": sql}).encode(),
    method="POST",
)
with urllib.request.urlopen(req) as res:
    print(res.read().decode()[:1500])
