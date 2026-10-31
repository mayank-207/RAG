export async function fetchProjects() {
  const response = await fetch('/api/projects');
  return response.json();
}

export async function createProject(payload: { title: string; budget: number }) {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

