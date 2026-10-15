import { csrfSync } from "csrf-sync";

export const { generateToken, csrfSynchronisedProtection, revokeToken } = csrfSync();
