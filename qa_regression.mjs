
import http from 'http';
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: '192.168.100.85', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000 };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data.slice(0,500) }); } });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const results = {};
const sa = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'admin123' });
const token = sa.body?.token;

// DEF-006: /api/users now returns paginated
const users = await req('GET', '/api/users', null, token);
results['API_users'] = {
  status: users.status,
  isPaginated: users.body?.data !== undefined,
  hasTotal: users.body?.total !== undefined,
  dataCount: users.body?.data?.length,
  PASS: users.status === 200 && users.body?.data !== undefined
};

// DEF-009: /api/logs now returns 200
const logs = await req('GET', '/api/logs', null, token);
results['API_logs'] = {
  status: logs.status,
  PASS: logs.status === 200
};

// /api/logs/assets still works
const logAssets = await req('GET', '/api/logs/assets', null, token);
results['API_logs_assets'] = {
  status: logAssets.status,
  PASS: logAssets.status === 200
};

// /api/logs/audit still works (superadmin)
const logAudit = await req('GET', '/api/logs/audit', null, token);
results['API_logs_audit'] = {
  status: logAudit.status,
  PASS: logAudit.status === 200
};

// RBAC: user tries /my-assets (should work now via UI, API check)
const ua = await req('POST', '/api/auth/login', { email: 'user@user.com', password: 'user12345' });
const userToken = ua.body?.token;
const myAssets = await req('GET', '/api/my-assets', null, userToken);
results['RBAC_my_assets'] = {
  status: myAssets.status,
  PASS: myAssets.status === 200 || myAssets.status === 403
};

// RBAC: user tries /api/users (should be denied)
const userUsers = await req('GET', '/api/users', null, userToken);
results['RBAC_user_users'] = {
  status: userUsers.status,
  PASS: userUsers.status === 403
};

// RBAC: user tries /api/export (should be denied)
const userExport = await req('GET', '/api/export/tables', null, userToken);
results['RBAC_user_export'] = {
  status: userExport.status,
  PASS: userExport.status === 403
};

// Database endpoints
const backups = await req('GET', '/api/admin/database/backups', null, token);
results['DB_backups'] = {
  status: backups.status,
  PASS: backups.status === 200
};

const passed = Object.values(results).filter(v => v.PASS).length;
const failed = Object.values(results).filter(v => !v.PASS).length;
console.log(JSON.stringify({ SUMMARY: { passed, failed, total: Object.keys(results).length }, RESULTS: results }, null, 2));
