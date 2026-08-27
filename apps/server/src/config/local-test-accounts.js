/**
 * Credentials used only by the disposable local/e2e test server.
 * Never use these accounts for a deployed or shared environment.
 */
export const LOCAL_TEST_ACCOUNTS = [
  { username: 'e2e-admin', password: 'e2e-pass-1234', role: 'admin' },
  { username: 'e2e-staff', password: 'e2e-staff-1234', role: 'staff' },
];
