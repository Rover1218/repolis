import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// The marker package throws outside a react-server bundle; tests import server modules directly.
vi.mock('server-only', () => ({}));
