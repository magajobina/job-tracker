import argon2 from "argon2";

import { AppError } from "../errors/app-error.js";
import { EmailAlreadyExistsError } from "./auth.errors.js";
import { findUserByEmail, findUserById, saveUser } from "./auth.repository.js";

export type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginUserInput = {
  email: string;
  password: string;
};

export async function registerUser(input: RegisterUserInput) {
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
  });

  try {
    const user = await saveUser({
      name: input.name,
      email: input.email,
      passwordHash,
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  } catch (error) {
    if (error instanceof EmailAlreadyExistsError) {
      throw new AppError(409, error.message);
    }

    throw error;
  }
}

export async function loginUser(input: LoginUserInput) {
  const user = await findUserByEmail(input.email);

  if (!user?.passwordHash) {
    throw new AppError(401, "Неверный email или пароль");
  }

  const passwordVerified = await argon2.verify(
    user.passwordHash,
    input.password,
  );

  if (!passwordVerified) {
    throw new AppError(401, "Неверный email или пароль");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export async function getAuthMeUser(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw new AppError(401, "Необходима авторизация");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
