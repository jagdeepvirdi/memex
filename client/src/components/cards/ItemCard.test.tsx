import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ItemCard from './ItemCard';
import type { Item } from '@shared/types';

const mockItem: Item = {
  id: '1',
  title: 'Test Note',
  type: 'note',
  content: 'Some content',
  structured: {},
  source: 'manual',
  reviewed: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  categories: [],
  tags: []
};

describe('ItemCard', () => {
  it('should render the title', () => {
    render(<ItemCard item={mockItem} />);
    expect(screen.getByText('Test Note')).toBeInTheDocument();
  });

  it('should show the review badge when not reviewed', () => {
    const unreviewedItem = { ...mockItem, reviewed: false };
    render(<ItemCard item={unreviewedItem} />);
    expect(screen.getByText('REVIEW')).toBeInTheDocument();
  });
});
