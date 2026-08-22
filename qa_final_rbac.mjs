
import http from 'http';
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: '192.168.100.85', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000 };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data.slice(0,200) }); } });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const ua = await req('POST', '/api/auth/login', { email: 'user@user.com', password: 'user12345' });
const userToken = ua.body?.token;

const results = {};
const myAssets = await req('GET', '/api/assets/my-assets', null, userToken);
results['my_assets'] = { status: myAssets.status, PASS: myAssets.status === 200 };

const users = await req('GET', '/api/users', null, userToken);
results['users'] = { status: users.status, PASS: users.status === 403 };

const exportCheck = await req('GET', '/api/export/tables', null, userToken);
results['export'] = { status: exportCheck.status, PASS: exportCheck.status === 403 };

const passed = Object.values(results).filter(v => v.PASS).length;
console.log(JSON.stringify({ SUMMARY: { passed, failed: Object.keys(results).length - passed }, RESULTS: results }, null, 2));
