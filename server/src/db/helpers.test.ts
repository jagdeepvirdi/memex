import { describe, it, expect, vi } from 'vitest';
import { resolveCategoryPath } from './helpers';
import type { PoolClient } from 'pg';

describe('Database Helpers', () => {
  describe('resolveCategoryPath', () => {
    it('should walk a category path and return IDs', async () => {
      const mockQuery = vi.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'id-1' }] }) // Food
          .mockResolvedValueOnce({ rows: [{ id: 'id-2' }] }) // Savory
          .mockResolvedValueOnce({ rows: [{ id: 'id-3' }] }); // Indian

      const mockClient = {
        query: mockQuery
      } as unknown as PoolClient;

      const path = ['Food', 'Savory', 'Indian'];
      const result = await resolveCategoryPath(mockClient, path);

      expect(result).toEqual(['id-1', 'id-2', 'id-3']);
      expect(mockQuery).toHaveBeenCalledTimes(3);
      
      // Verify parent_id was passed correctly
      expect(mockQuery.mock.calls[0][1]).toEqual(['Food', null]);
      expect(mockQuery.mock.calls[1][1]).toEqual(['Savory', 'id-1']);
      expect(mockQuery.mock.calls[2][1]).toEqual(['Indian', 'id-2']);
    });
  });
});
