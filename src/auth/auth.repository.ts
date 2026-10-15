import { QueryFailedError } from "typeorm";

import { AppDataSource } from "../data-source.js";
import { User } from "../entities/user.entity.js";
import { EmailAlreadyExistsError } from "./auth.errors.js";

type SaveUserData = {
  name: string;
  email: string;
  passwordHash: string;
};

export async function saveUser(data: SaveUserData) {
  const usersRepository = AppDataSource.getRepository(User);

  const user = usersRepository.create(data);

  try {
    return await usersRepository.save(user);
  } catch (error) {
    const isUniqueViolation =
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === "23505";

    if (isUniqueViolation) {
      throw new EmailAlreadyExistsError();
    }

    throw error;
  }
}

export async function findUserByEmail(email: string) {
  const usersRepository = AppDataSource.getRepository(User);

  return usersRepository.findOneBy({ email });
}

export async function findUserById(id: string) {
  const usersRepository = AppDataSource.getRepository(User);

  return usersRepository.findOneBy({ id });
}
