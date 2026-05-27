import '@testing-library/jest-dom';
import { Crypto } from '@peculiar/webcrypto';

// Use a real-behaving polyfill for Web Crypto in tests
const crypto = new Crypto();
Object.defineProperty(window, 'crypto', {
  value: crypto,
});
