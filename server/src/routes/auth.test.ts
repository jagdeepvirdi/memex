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
