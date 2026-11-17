import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db/client';
import bcrypt from 'bcryptjs';

vi.mock('../db/client', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  }
}));

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/auth/status', () => {
    it('is public and says a fresh install needs setup', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await request(app).get('/api/auth/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ needsSetup: true });
    });

    it('says an installation with an account does not', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [{ count: '1' }] });
      expect((await request(app).get('/api/auth/status')).body).toEqual({ needsSetup: false });
    });

    it('answers 500 with a plain message when the database cannot be read', async () => {
      (pool.query as any).mockRejectedValueOnce(new Error('db down'));
      const res = await request(app).get('/api/auth/status');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Could not check the installation' });
    });

    it('reveals nothing but the boolean', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [{ count: '3' }] });
      expect(Object.keys((await request(app).get('/api/auth/status')).body)).toEqual(['needsSetup']);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 401 for invalid credentials', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // User not found

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 200 and token for valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('password', 10);
      (pool.query as any).mockResolvedValueOnce({ 
        rows: [{ id: 'u1', email: 'test@example.com', password_hash: hashedPassword }] 
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('test@example.com');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
