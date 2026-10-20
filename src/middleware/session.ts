import session from "express-session";
import { RedisStore } from "connect-redis";
import { redisClient } from "../redis.js";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("Переменная SESSION_SECRET не указана");
}

const redisStore = new RedisStore({
  client: redisClient,
  prefix: "jt:sess:",
});

export const sessionMiddleware = session({
  name: "job-tracker.sid",
  secret: sessionSecret,

  store: redisStore,

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  },
});
