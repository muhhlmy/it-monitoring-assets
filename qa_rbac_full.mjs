
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

// Get SA and Admin tokens
const saLogin = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'admin123' });
const adminLogin = await req('POST', '/api/auth/login', { email: 'admin@admin.com', password: 'admin123' });
const saToken = saLogin.body?.token;
const adminToken = adminLogin.body?.token;

results['DEF_01_users_api_returns_array_not_paginated'] = {
  DEFECT: true, severity: 'MEDIUM',
  description: '/api/users returns raw array instead of {data:[], total, page} pagination object',
  actual: Array.isArray(saLogin.body) ? 'array' : 'object',
  users_body_type: 'will check below'
};

const usersResp = await req('GET', '/api/users', null, saToken);
results['DEF_01_users_api_returns_array_not_paginated'].users_body_type = Array.isArray(usersResp.body) ? 'ARRAY (defect)' : 'object (ok)';
results['DEF_01_users_api_returns_array_not_paginated'].DEFECT = Array.isArray(usersResp.body);

// RBAC: User cannot access admin endpoints
// Try user@user.com with admin123 (their actual pw from DB fixture)
const userLogin = await req('POST', '/api/auth/login', { email: 'user@user.com', password: 'admin123' });
console.log('user login (admin123):', userLogin.status, userLogin.body?.error?.code);
const userToken = userLogin.body?.token;

if (userToken) {
  // User tries admin endpoints
  const userGetUsers = await req('GET', '/api/users', null, userToken);
  results['RBAC_02_user_cannot_get_users'] = { status: userGetUsers.status, PASS: userGetUsers.status === 403 };
  
  const userGetLogs = await req('GET', '/api/logs/assets', null, userToken);
  results['RBAC_03_user_cannot_get_logs'] = { status: userGetLogs.status, PASS: userGetLogs.status === 403 };
  
  const userGetEmployees = await req('GET', '/api/employees', null, userToken);
  results['RBAC_04_user_cannot_get_employees'] = { status: userGetEmployees.status, PASS: userGetEmployees.status === 403 };
  
  // User tries DB backup (superadmin only)
  const userGetBackup = await req('GET', '/api/admin/database/backups', null, userToken);
  results['RBAC_05_user_cannot_get_backup'] = { status: userGetBackup.status, PASS: userGetBackup.status === 403 };
  
  // User can access own data
  const userGetMe = await req('GET', '/api/auth/me', null, userToken);
  results['RBAC_06_user_can_get_own_profile'] = { status: userGetMe.status, PASS: userGetMe.status === 200 };
  
  // User can access tickets
  const userGetTickets = await req('GET', '/api/tickets', null, userToken);
  results['RBAC_07_user_can_get_tickets'] = { status: userGetTickets.status, PASS: userGetTickets.status === 200 };
} else {
  results['RBAC_NOTE'] = 'Could not get user token - rate limited or wrong password';
}

// Admin RBAC: Admin cannot access superadmin-only endpoint
if (adminToken) {
  const adminGetBackup = await req('GET', '/api/admin/database/backups', null, adminToken);
  results['RBAC_08_admin_cannot_access_backup'] = { status: adminGetBackup.status, PASS: adminGetBackup.status === 403 };
  
  const adminGetAuditLog = await req('GET', '/api/logs/audit', null, adminToken);
  results['RBAC_09_admin_cannot_get_audit_log'] = { status: adminGetAuditLog.status, PASS: adminGetAuditLog.status === 403 };
  
  const adminGetUsers = await req('GET', '/api/users', null, adminToken);
  results['RBAC_10_admin_can_get_users'] = { status: adminGetUsers.status, PASS: adminGetUsers.status === 200 };
}

// Correct logs endpoint
const logsAssets = await req('GET', '/api/logs/assets', null, saToken);
results['API_06_CORRECTED_logs_assets'] = { status: logsAssets.status, PASS: logsAssets.status === 200 };

const logsAudit = await req('GET', '/api/logs/audit', null, saToken);
results['API_06b_logs_audit'] = { status: logsAudit.status, PASS: logsAudit.status === 200 };

// IDOR: User accessing another user's resource
if (userToken) {
  const idor = await req('GET', '/api/users/1', null, userToken);
  results['SEC_IDOR_user_cannot_access_admin_record'] = { status: idor.status, PASS: idor.status === 403 };
}

// Check /api/users/:id
const getUser1 = await req('GET', '/api/users/1', null, saToken);
results['API_get_user_by_id'] = { status: getUser1.status, PASS: getUser1.status === 200 };

console.log(JSON.stringify(results, null, 2));
