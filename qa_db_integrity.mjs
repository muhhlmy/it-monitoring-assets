import http from 'http';
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: '192.168.100.85', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000 };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data.slice(0,300) }); } });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const results = {};
const sa = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'admin123' });
const token = sa.body?.token;

const assets = await req('GET', '/api/assets?limit=100', null, token);
const assetList = assets.body?.data || (Array.isArray(assets.body) ? assets.body : []);
results['DB_01_assets'] = {
  count: assetList.length,
  missingHostname: assetList.filter(a => !a.hostname).length,
  missingSerialNumber: assetList.filter(a => !a.serial_number).length,
  missingStatus: assetList.filter(a => !a.status).length,
  PASS: assetList.every(a => a.id && a.status)
};

const logs = await req('GET', '/api/logs/assets', null, token);
const logList = Array.isArray(logs.body) ? logs.body : (logs.body?.data || []);
results['DB_02_audit_logs'] = { status: logs.status, count: logList.length, PASS: logs.status === 200 };

const auditLogs = await req('GET', '/api/logs/audit', null, token);
results['DB_03_login_audit'] = { status: auditLogs.status, PASS: auditLogs.status === 200 };

const backups = await req('GET', '/api/admin/database/backups', null, token);
const bkpBody = backups.body;
results['DB_04_backup_history'] = {
  status: backups.status,
  dataType: Array.isArray(bkpBody) ? 'array' : (bkpBody?.data ? 'paginated' : typeof bkpBody),
  count: Array.isArray(bkpBody?.data) ? bkpBody.data.length : 0,
  sample: bkpBody?.data?.[0] ? { filename: bkpBody.data[0].filename, status: bkpBody.data[0].status, file_size: bkpBody.data[0].file_size } : null,
  PASS: backups.status === 200
};

const tickets = await req('GET', '/api/tickets', null, token);
const ticketList = Array.isArray(tickets.body) ? tickets.body : (tickets.body?.data || []);
results['DB_05_tickets'] = { status: tickets.status, count: ticketList.length, PASS: tickets.status === 200 };

const employees = await req('GET', '/api/employees', null, token);
const empList = Array.isArray(employees.body) ? employees.body : (employees.body?.data || []);
results['DB_06_employees'] = { status: employees.status, count: empList.length, PASS: employees.status === 200 };

const gaAssets = await req('GET', '/api/ga-assets', null, token);
const gaList = gaAssets.body?.data || (Array.isArray(gaAssets.body) ? gaAssets.body : []);
results['DB_07_ga_assets'] = { status: gaAssets.status, count: gaList.length, PASS: gaAssets.status === 200 };

const opsAssets = await req('GET', '/api/ops-assets', null, token);
const opsList = opsAssets.body?.data || (Array.isArray(opsAssets.body) ? opsAssets.body : []);
results['DB_08_ops_assets'] = { status: opsAssets.status, count: opsList.length, PASS: opsAssets.status === 200 };

// Concurrent creates
const concResp = await Promise.all([
  req('POST', '/api/assets', { hostname: 'CONCURRENT-TEST-1', serial_number: 'SERIAL-CONC-1', jenis: 'Laptop', status: 'Aktif' }, token),
  req('POST', '/api/assets', { hostname: 'CONCURRENT-TEST-2', serial_number: 'SERIAL-CONC-2', jenis: 'Laptop', status: 'Aktif' }, token),
]);
results['DB_09_concurrent_creates'] = {
  statuses: concResp.map(r => r.status),
  PASS: concResp.every(r => [200, 201, 400, 409, 422].includes(r.status))
};

// Export
const exportResp = await req('GET', '/api/export/tables', null, token);
results['DB_10_export_tables'] = { status: exportResp.status, tables: exportResp.body?.tables?.length, PASS: exportResp.status === 200 };

const passed = Object.values(results).filter(v => v.PASS === true).length;
const failed = Object.values(results).filter(v => v.PASS === false).length;
console.log(JSON.stringify({ SUMMARY: { passed, failed }, RESULTS: results }, null, 2));
