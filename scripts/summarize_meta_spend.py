import json
from pathlib import Path

accounts_path = Path('/tmp/manus-mcp/mcp_result_950903e9020f4a998fce5f929463a9dc.json')
metric_def_path = Path('/tmp/manus-mcp/mcp_result_87e8447121804c629127616be04ab1de.json')

spend_files = {
    'MANOS AL HOGAR': ('/tmp/manus-mcp/mcp_result_9eeac231230d474ab6f255bee64eb5dd.json', 'act_1581946449839805'),
    'INSPIRA': ('/tmp/manus-mcp/mcp_result_2e45aa89a9b14b27b6de95adfbdd17a4.json', 'act_949679304398951'),
    'INQ': ('/tmp/manus-mcp/mcp_result_c9bf207061694e7f9ee3931b44b7c8c9.json', 'act_1584938395981836'),
    'HOGARES': ('/tmp/manus-mcp/mcp_result_02025e4ebc284cefadaa1d235fc22a24.json', 'act_2175146543225091'),
    'GRUPO ELIJO': ('/tmp/manus-mcp/mcp_result_27572e94fc264b13b2d39bea0baeaad3.json', 'act_864948876563125'),
}

accounts = json.loads(accounts_path.read_text())['result']['adAccounts']
accounts_by_id = {a['id']: a for a in accounts}

rows = []
for client, (path, account_id) in spend_files.items():
    payload = json.loads(Path(path).read_text())
    result = payload.get('result') or payload
    if isinstance(result, dict) and 'insights' in result:
        data = result['insights']
    elif isinstance(result, dict) and 'data' in result:
        data = result['data']
    elif isinstance(result, list):
        data = result
    else:
        data = []
    first = data[0] if data else {}
    account = accounts_by_id[account_id]
    rows.append({
        'cliente': client,
        'cuenta_publicitaria': account['name'],
        'id_cuenta': account_id,
        'estado': 'ACTIVE' if account.get('account_status') == 1 else str(account.get('account_status')),
        'moneda': account.get('currency', 'N/A'),
        'importe_gastado': float(first['spend']) if first.get('spend') not in (None, '') else None,
    })

all_relevant = [a for a in accounts if any(term in a['name'].lower() for term in ['hogar', 'hogares', 'inspira', 'inq', 'elijo'])]
rows.append({
    'cliente': 'DOS HOGARES',
    'cuenta_publicitaria': 'No aparece como cuenta separada visible; revisar si opera dentro de IIHogares GDL CP u otra cuenta compartida.',
    'id_cuenta': 'N/A',
    'estado': 'N/A',
    'moneda': 'N/A',
    'importe_gastado': None,
})

output = {
    'periodo': '2026-05-01 a 2026-05-10',
    'metric_name': 'Importe gastado',
    'rows': rows,
    'relevant_accounts_found': all_relevant,
}
Path('/home/ubuntu/pipeline-clientes-sinahi/meta_spend_summary.json').write_text(json.dumps(output, ensure_ascii=False, indent=2))

for row in rows:
    value = 'N/A' if row['importe_gastado'] is None else f"${row['importe_gastado']:,.2f} {row['moneda']}"
    print(f"{row['cliente']} | {row['cuenta_publicitaria']} | {row['id_cuenta']} | {value}")
