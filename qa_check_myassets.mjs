
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

const ua = await req('POST', '/api/auth/login', { email: 'user@user.com', password: 'user12345' });
const userToken = ua.body?.token;

// Correct endpoint: /api/assets/my-assets
const myAssets = await req('GET', '/api/assets/my-assets', null, userToken);
console.log(JSON.stringify({ status: myAssets.status, body: myAssets.body }, null, 2));
