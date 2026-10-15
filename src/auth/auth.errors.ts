export class EmailAlreadyExistsError extends Error {
  constructor() {
    super("Пользователь с таким email уже существует");
  }
}
