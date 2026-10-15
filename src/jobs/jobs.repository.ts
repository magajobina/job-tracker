import { AppDataSource } from "../data-source.js";
import { Job } from "../entities/job.entity.js";
import { User } from "../entities/user.entity.js";

type SaveJobData = {
  title: string;
  company: string;
  salary: number | null;
  createdBy: User;
};

// Более не нужно т.к. ищется реальный юзер
// export async function findLatestUser() {
//   const usersRepository = AppDataSource.getRepository(User);

//   const [user] = await usersRepository.find({
//     take: 1,
//     order: {
//       id: "DESC",
//     },
//   });

//   return user;
// }

export async function saveJob(data: SaveJobData) {
  const jobsRepository = AppDataSource.getRepository(Job);

  const job = jobsRepository.create(data);

  return jobsRepository.save(job);
}
