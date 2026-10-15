import session from "express-session";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("Переменная SESSION_SECRET не указана");
}

export const sessionMiddleware = session({
  name: "job-tracker.sid",
  secret: sessionSecret,

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  },
});
