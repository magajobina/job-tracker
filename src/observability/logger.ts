import pino from "pino";

export const logger = pino({
  level: "info",

  timestamp: pino.stdTimeFunctions.isoTime,

  redact: {
    paths: [
      "password",
      "passwordHash",
      "cookie",
      "authorization",
      "csrfToken",
      "sessionId",
    ],

    remove: true,
  },
});
