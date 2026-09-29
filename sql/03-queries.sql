SELECT id, user_id
FROM public.applications
ORDER BY id;

-- SELECT a.id, j.title, j.company, a.status, a.created_at
-- FROM public.applications AS a
-- JOIN public.users AS u ON a.user_id = u.id
-- JOIN public.jobs AS j ON a.job_id = j.id
-- WHERE u.email = 'student1@example.com'
-- ORDER BY a.created_at DESC, a.id DESC;

-- SELECT j.id AS job_id, j.title AS job_title, COUNT(a.id) AS application_count
-- FROM public.jobs AS j
-- LEFT JOIN public.applications AS a ON a.job_id = j.id
-- GROUP BY j.id
-- HAVING COUNT(a.id) >= 5
-- ORDER BY application_count DESC, j.id;

-- SELECT user_id,
--        COUNT(*) AS application_count,
--        MIN(created_at) AS first_application_at,
--        MAX(created_at) AS last_application_at
-- FROM public.applications
-- GROUP BY user_id
-- ORDER BY user_id;

-- SELECT j.id, j.title, COUNT(a.id) AS new_application_count
-- FROM public.jobs AS j
-- LEFT JOIN public.applications AS a
--   ON a.job_id = j.id AND a.status = 'new'
-- GROUP BY j.id, j.title
-- ORDER BY j.id;

-- SELECT a.id, a.status
-- FROM public.applications as a
-- WHERE a.status = 'interview';

-- SELECT j.id AS job_id, j.title AS job_title, COUNT(a.id) AS application_count
-- FROM public.jobs AS j
-- LEFT JOIN public.applications AS a ON a.job_id = j.id AND a.status = 'new'
-- GROUP BY j.id
-- ORDER BY application_count DESC, j.id;

-- Практика: получи отклики student1@example.com с названиями вакансий,
-- посчитай отклики по каждой вакансии и проверь вакансию с нулевым результатом.
-- Затем объясни разницу между WHERE и HAVING на своём запросе.


-- ТЕМА 6
SELECT j.id AS job_id, j.title AS job_title, COUNT(a.id) as application_count
FROM public.jobs AS j
LEFT JOIN public.applications AS a ON a.job_id = j.id
JOIN public.users AS u ON a.user_id = u.id
WHERE u.email = 'student1@example.com'
GROUP BY j.id, j.title
ORDER BY j.id;

SELECT j.id AS job_id, j.title AS job_title, COUNT(a.id) FILTER (WHERE u.email = 'student1@example.com') AS application_count
FROM public.jobs AS j
LEFT JOIN public.applications AS a ON a.job_id = j.id
LEFT JOIN public.users AS u ON a.user_id = u.id
GROUP BY j.id, j.title
HAVING COUNT(a.id) FILTER (
  WHERE u.email = 'student1@example.com'
) > 0
ORDER BY j.id;

SELECT a.id, j.id, a.status
FROM public.applications AS a
JOIN public.jobs AS j ON a.job_id = j.id
JOIN public.users AS u ON a.user_id = u.id
WHERE u.email = 'student1@example.com';

SELECT j.company,
       COUNT(a.id) FILTER (WHERE a.status = 'new') AS new_count,
       COUNT(a.id) FILTER (WHERE a.status = 'offer') AS offer_count
FROM public.jobs AS j
LEFT JOIN public.applications AS a ON a.job_id = j.id
GROUP BY j.company
ORDER BY j.company;

SELECT id, user_id, job_id, status
FROM public.applications
WHERE job_id IN (
  SELECT id
  FROM public.jobs
  WHERE company = 'Acme'
)
ORDER BY id;

WITH company_jobs AS (
  SELECT id
  FROM public.jobs
  WHERE company = 'Acme'
)
SELECT a.id, a.user_id, a.job_id, a.status
FROM public.applications AS a
JOIN company_jobs AS cj ON cj.id = a.job_id
ORDER BY a.id;
-- SELECT выбирает колонки не прямо из первоначального applications, 
-- а из результата, который сформировали FROM и JOIN. 
-- Поэтому к моменту выполнения SELECT неподходящие отклики уже отсеяны.

WITH job_counts AS (
  SELECT j.id, COUNT(a.id) AS application_count
  FROM public.jobs AS j
  LEFT JOIN public.applications AS a ON a.job_id = j.id
  GROUP BY j.id
)
SELECT COUNT(*) AS job_count,
       SUM(application_count) AS total_applications,
       AVG(application_count) AS average_per_job,
       MIN(application_count) AS minimum_per_job,
       MAX(application_count) AS maximum_per_job
FROM job_counts;

SELECT id, title, company, created_at,
       ROW_NUMBER() OVER (
         PARTITION BY company
         ORDER BY created_at DESC, id DESC
       ) AS position_in_company
FROM public.jobs
ORDER BY company, position_in_company;