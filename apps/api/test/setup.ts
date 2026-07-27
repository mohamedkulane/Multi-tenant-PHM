process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://phms_test:phms_test_password@localhost:5432/phms_test?schema=public";
process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters";
process.env.WEB_ORIGINS = "http://localhost:5173";
process.env.LOG_LEVEL = "silent";
