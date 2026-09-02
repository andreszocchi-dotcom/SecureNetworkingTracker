import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    // The default `npm test` run covers only the offline unit tests. The live RLS proof lives in
    // tests/rls-two-user.test.ts and runs via `npm run test:rls`, because it needs real
    // credentials and a deployed database.
    include: ['tests/contact-schema.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
