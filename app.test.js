const request = require('supertest');
const app = require('./app');

// Reads the current value of root_access_total from /metrics
async function readCounter() {
    const res = await request(app).get('/metrics');
    const match = res.text.match(/^root_access_total (\d+)$/m);
    return match ? Number(match[1]) : null;
}

describe('health probes', () => {
    test('GET /live returns 200', async () => {
        const res = await request(app).get('/live');
        expect(res.status).toBe(200);
    });

    test('GET /ready returns 200', async () => {
        const res = await request(app).get('/ready');
        expect(res.status).toBe(200);
    });
});

describe('app endpoints', () => {
    test('GET /my-app returns hello world', async () => {
        const res = await request(app).get('/my-app');
        expect(res.status).toBe(200);
        expect(res.text).toBe('Hello, World!');
    });

    test('GET /about returns the app description', async () => {
        const res = await request(app).get('/about');
        expect(res.status).toBe(200);
        expect(res.text).toContain('sample Node.js application');
    });

    test('GET /classified returns 200', async () => {
        const res = await request(app).get('/classified');
        expect(res.status).toBe(200);
    });
});

describe('metrics', () => {
    test('GET /my-app increments root_access_total by 1', async () => {
        const before = await readCounter();
        await request(app).get('/my-app');
        const after = await readCounter();

        expect(before).not.toBeNull();
        expect(after).toBe(before + 1);
    });
});
